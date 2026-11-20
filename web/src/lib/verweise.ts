import { type CustomField } from './types';

export type VerweisArt = 'COMPANY' | 'CONTACT' | 'DEAL';

export type VerweisTitel = {
  id: string;
  titel: string | null;
  sichtbar: boolean;
};

const PFAD: Record<VerweisArt, string> = {
  COMPANY: '/firmen',
  CONTACT: '/kontakte',
  DEAL: '/geschaefte',
};

export const VERWEIS_ART_EINZAHL: Record<VerweisArt, string> = {
  COMPANY: 'Firma',
  CONTACT: 'Kontakt',
  DEAL: 'Geschäft',
};

export const verweisPfad = (art: VerweisArt, id: string): string =>
  `${PFAD[art]}/${id}`;

export const istVerweisArt = (
  art: string | null | undefined,
): art is VerweisArt =>
  art === 'COMPANY' || art === 'CONTACT' || art === 'DEAL';

export const verweisIds = (wert: unknown): string[] => {
  if (typeof wert === 'string') {
    return wert === '' ? [] : [wert];
  }

  return Array.isArray(wert)
    ? wert.filter((eintrag): eintrag is string => typeof eintrag === 'string')
    : [];
};

export const verweisSenden = (ids: readonly string[]): string =>
  [...new Set(ids)].join(';');

export const verweisDazu = (
  feld: Pick<CustomField, 'mehrere'>,
  bisher: readonly string[],
  id: string,
): string[] =>
  feld.mehrere === true
    ? bisher.includes(id)
      ? [...bisher]
      : [...bisher, id]
    : [id];

export const verweisWeg = (bisher: readonly string[], id: string): string[] =>
  bisher.filter((eintrag) => eintrag !== id);

export const verweisText = (titel: VerweisTitel | undefined): string | null => {
  if (titel === undefined) {
    return null;
  }

  return titel.sichtbar ? titel.titel || 'Ohne Namen' : 'Nicht sichtbar';
};

type Holen = (art: VerweisArt, ids: string[]) => Promise<VerweisTitel[]>;

export const MAX_JE_ANFRAGE = 500;

export const MAX_ALTER_MS = 60_000;

export class VerweisLader {
  private readonly bekannt = new Map<
    string,
    { titel: VerweisTitel | null; zeit: number }
  >();
  private readonly offen = new Map<VerweisArt, Set<string>>();
  private readonly hoerer = new Set<() => void>();
  private geplant = false;
  private vergessenStand = 0;

  constructor(
    private readonly holen: Holen,
    private readonly planen: (lauf: () => void) => void = (lauf) =>
      queueMicrotask(lauf),
    private readonly jetzt: () => number = () => Date.now(),
  ) {}

  private schluessel(art: VerweisArt, id: string): string {
    return `${art}:${id}`;
  }

  lesen(art: VerweisArt, id: string): VerweisTitel | null | undefined {
    return this.bekannt.get(this.schluessel(art, id))?.titel;
  }

  abonnieren(hoerer: () => void): () => void {
    this.hoerer.add(hoerer);

    return () => {
      this.hoerer.delete(hoerer);
    };
  }

  anfordern(art: VerweisArt, ids: readonly string[]): void {
    const grenze = this.jetzt() - MAX_ALTER_MS;
    const neu = ids.filter((id) => {
      const gemerkt = this.bekannt.get(this.schluessel(art, id));

      return gemerkt === undefined || gemerkt.zeit < grenze;
    });

    if (neu.length === 0) {
      return;
    }

    const menge = this.offen.get(art) ?? new Set<string>();

    for (const id of neu) {
      menge.add(id);
    }

    this.offen.set(art, menge);

    if (!this.geplant) {
      this.geplant = true;
      this.planen(() => void this.abarbeiten());
    }
  }

  get stand(): number {
    return this.vergessenStand;
  }

  vergessen(): void {
    for (const eintrag of this.bekannt.values()) {
      eintrag.zeit = Number.NEGATIVE_INFINITY;
    }

    this.vergessenStand += 1;
    this.melden();
  }

  private async abarbeiten(): Promise<void> {
    this.geplant = false;

    const auftraege = [...this.offen.entries()];

    this.offen.clear();

    await Promise.all(
      auftraege.flatMap(([art, menge]) => {
        const ids = [...menge];
        const teile: string[][] = [];

        for (let start = 0; start < ids.length; start += MAX_JE_ANFRAGE) {
          teile.push(ids.slice(start, start + MAX_JE_ANFRAGE));
        }

        return teile.map(async (teil) => {
          let antwort: VerweisTitel[];

          try {
            antwort = await this.holen(art, teil);
          } catch {
            return;
          }

          const gefunden = new Map(antwort.map((t) => [t.id, t]));
          const zeit = this.jetzt();

          for (const id of teil) {
            this.bekannt.set(this.schluessel(art, id), {
              titel: gefunden.get(id) ?? null,
              zeit,
            });
          }
        });
      }),
    );

    this.melden();
  }

  private melden(): void {
    for (const hoerer of this.hoerer) {
      hoerer();
    }
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { UserEntity } from '../users/user.entity';
import { eingeschraenktAuf } from '../workspaces/sichtbarkeit';
import { DealEntity } from './entities/deal.entity';
import { pipelineBedingung } from './pipelines';

export type AuswertungMonatDaten = {
  monat: string;
  gewonnenAnzahl: number;
  gewonnenSumme: number;
  verlorenAnzahl: number;
  verlorenSumme: number;
};

export type AuswertungVerkaeuferDaten = {
  ownerId: string | null;
  name: string;
  offenAnzahl: number;
  offenSumme: number;
  gewonnenAnzahl: number;
  gewonnenSumme: number;
  verlorenAnzahl: number;
  quote: number | null;
};

export type AuswertungDaten = {
  von: string;
  bis: string;
  gewonnenAnzahl: number;
  gewonnenSumme: number;
  verlorenAnzahl: number;
  verlorenSumme: number;
  abschlussquote: number | null;
  durchschnittWert: number | null;
  durchschnittTage: number | null;
  neueGeschaefte: number;
  monate: AuswertungMonatDaten[];
  verkaeufer: AuswertungVerkaeuferDaten[];
  verlustgruende: { grund: string; anzahl: number; summe: number }[];
  verweildauer: { phase: string; anzahl: number; tage: number }[];
};

const DATUM = /^\d{4}-\d{2}-\d{2}$/u;

const HOECHSTENS_MONATE = 60;

const SICHTBAR = (tabelle: string, a: number, b: number): string =>
  `($${String(a)}::boolean IS NOT TRUE OR ${tabelle}."ownerId" IS NULL OR ${tabelle}."ownerId" = $${String(b)}::uuid OR EXISTS (SELECT 1 FROM "freigaben" fg WHERE fg."workspaceId" = ${tabelle}."workspaceId" AND fg."art" = 'deal' AND fg."datensatzId" = ${tabelle}."id" AND fg."userId" = $${String(b)}::uuid))`;

const ABGESCHLOSSEN = `
  WITH wechsel AS (
    SELECT d.id,
           (SELECT max(a."createdAt") FROM audit_log a
             WHERE a."workspaceId" = d."workspaceId"
               AND a."entityType" = 'Deal'
               AND a."entityId" = d.id
               AND a.changes -> 'stage' ->> 1 = d.stage::text) AS erreicht
      FROM deals d
     WHERE d."workspaceId" = $1
       AND d."deletedAt" IS NULL
       AND d.stage IN ('won', 'lost')
       AND ($4::uuid IS NULL OR d."ownerId" = $4::uuid)
       AND ($7::uuid IS NULL OR ${pipelineBedingung('d', '$7::uuid')})
       AND ${SICHTBAR('d', 5, 6)}
  ), abgeschlossen AS (
    SELECT d.id, d.stage::text AS phase,
           coalesce(d.amount, 0)::float8 AS betrag,
           d.amount IS NOT NULL AS "mitBetrag",
           d."ownerId", d."lostReason", d."createdAt",
           to_char(coalesce(d."closeDate", w.erreicht::date, d."updatedAt"::date),
                   'YYYY-MM-DD') AS tag,
           coalesce(w.erreicht, d."closeDate"::timestamptz, d."updatedAt") AS zeitpunkt
      FROM deals d JOIN wechsel w ON w.id = d.id
  )
  SELECT * FROM abgeschlossen WHERE tag::date BETWEEN $2::date AND $3::date
`;

type Zeile = {
  id: string;
  phase: 'won' | 'lost';
  betrag: number;
  mitBetrag: boolean;
  ownerId: string | null;
  lostReason: string | null;
  createdAt: Date;
  tag: string;
  zeitpunkt: Date;
};

const monateZwischen = (von: string, bis: string): string[] => {
  const liste: string[] = [];
  let jahr = Number(von.slice(0, 4));
  let monat = Number(von.slice(5, 7));
  const ende = bis.slice(0, 7);

  for (;;) {
    const schluessel = `${String(jahr)}-${String(monat).padStart(2, '0')}`;

    liste.push(schluessel);

    if (schluessel >= ende || liste.length > HOECHSTENS_MONATE) {
      return liste;
    }

    monat += 1;

    if (monat > 12) {
      monat = 1;
      jahr += 1;
    }
  }
};

const VERWEILDAUER = `
  WITH wechsel AS (
    SELECT a."entityId" AS id, a."createdAt" AS zeit,
           a.changes -> 'stage' ->> 0 AS phase
      FROM audit_log a
      JOIN deals d ON d.id = a."entityId"
     WHERE a."workspaceId" = $1
       AND a."entityType" = 'Deal'
       AND a.changes ? 'stage'
       AND d."deletedAt" IS NULL
       AND ($4::uuid IS NULL OR d."ownerId" = $4::uuid)
       AND ($7::uuid IS NULL OR ${pipelineBedingung('d', '$7::uuid')})
       AND ${SICHTBAR('d', 5, 6)}
  ), aufenthalte AS (
    SELECT w.phase, w.zeit,
           coalesce(lag(w.zeit) OVER (PARTITION BY w.id ORDER BY w.zeit),
                    d."createdAt") AS seit
      FROM wechsel w
      JOIN deals d ON d.id = w.id
  )
  SELECT phase, count(*)::int AS anzahl,
         avg(extract(epoch FROM (zeit - seit)) / 86400)::float8 AS tage
    FROM aufenthalte
   WHERE phase IS NOT NULL
     AND zeit::date BETWEEN $2::date AND $3::date
   GROUP BY phase
`;

const quote = (gewonnen: number, verloren: number): number | null =>
  gewonnen + verloren === 0 ? null : gewonnen / (gewonnen + verloren);

const summe = (liste: Zeile[]): number =>
  liste.reduce((gesamt, z) => gesamt + Number(z.betrag), 0);

@Injectable()
export class AuswertungService {
  constructor(
    @InjectRepository(DealEntity)
    private readonly deals: Repository<DealEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  async berechne(
    workspaceId: string,
    von: string,
    bis: string,
    ownerId: string | null,
    pipelineId: string | null = null,
  ): Promise<AuswertungDaten> {
    if (!DATUM.test(von) || !DATUM.test(bis) || von > bis) {
      throw new BadRequestException(
        'Der Zeitraum braucht ein Von- und ein Bis-Datum, und Von liegt nicht nach Bis.',
      );
    }

    if (monateZwischen(von, bis).length > HOECHSTENS_MONATE) {
      throw new BadRequestException(
        'Der Zeitraum darf höchstens fünf Jahre umfassen.',
      );
    }

    const grenze = await eingeschraenktAuf('deal');
    const sicht = [grenze !== null, grenze?.ich ?? null];
    const params = [workspaceId, von, bis, ownerId, ...sicht, pipelineId];
    const [zeilen, neu, offen, verweildauer] = await Promise.all([
      this.deals.query(ABGESCHLOSSEN, params) as Promise<Zeile[]>,
      this.deals.query(
        `SELECT count(*)::int AS anzahl FROM deals
          WHERE "workspaceId" = $1 AND "deletedAt" IS NULL
            AND "createdAt"::date BETWEEN $2::date AND $3::date
            AND ($4::uuid IS NULL OR "ownerId" = $4::uuid)
            AND ${SICHTBAR('deals', 5, 6)}
            AND ($7::uuid IS NULL OR ${pipelineBedingung('deals', '$7::uuid')})`,
        params,
      ) as Promise<{ anzahl: number }[]>,
      this.deals.query(
        `SELECT "ownerId", count(*)::int AS anzahl,
                coalesce(sum(amount), 0)::float8 AS summe
           FROM deals
          WHERE "workspaceId" = $1 AND "deletedAt" IS NULL
            AND stage NOT IN ('won', 'lost')
            AND ($2::uuid IS NULL OR "ownerId" = $2::uuid)
            AND ${SICHTBAR('deals', 3, 4)}
            AND ($5::uuid IS NULL OR ${pipelineBedingung('deals', '$5::uuid')})
          GROUP BY "ownerId"`,
        [workspaceId, ownerId, ...sicht, pipelineId],
      ) as Promise<{ ownerId: string | null; anzahl: number; summe: number }[]>,
      this.deals.query(VERWEILDAUER, params) as Promise<
        { phase: string; anzahl: number; tage: number }[]
      >,
    ]);

    const gewonnen = zeilen.filter((z) => z.phase === 'won');
    const verloren = zeilen.filter((z) => z.phase === 'lost');
    const mitBetrag = gewonnen.filter((z) => z.mitBetrag);
    const tage = gewonnen.map(
      (z) =>
        (new Date(z.zeitpunkt).getTime() - new Date(z.createdAt).getTime()) /
        86_400_000,
    );

    return {
      von,
      bis,
      gewonnenAnzahl: gewonnen.length,
      gewonnenSumme: summe(gewonnen),
      verlorenAnzahl: verloren.length,
      verlorenSumme: summe(verloren),
      abschlussquote: quote(gewonnen.length, verloren.length),
      durchschnittWert:
        mitBetrag.length === 0 ? null : summe(mitBetrag) / mitBetrag.length,
      durchschnittTage:
        tage.length === 0
          ? null
          : Math.max(0, tage.reduce((a, b) => a + b, 0) / tage.length),
      neueGeschaefte: Number(neu[0]?.anzahl ?? 0),
      monate: this.jeMonat(zeilen, von, bis),
      verkaeufer: await this.jeVerkaeufer(zeilen, offen),
      verlustgruende: this.gruende(verloren),
      verweildauer: verweildauer.map((zeile) => ({
        phase: zeile.phase,
        anzahl: Number(zeile.anzahl),
        tage: Math.max(0, Number(zeile.tage)),
      })),
    };
  }

  private jeMonat(
    zeilen: Zeile[],
    von: string,
    bis: string,
  ): AuswertungMonatDaten[] {
    const monate = new Map<string, AuswertungMonatDaten>(
      monateZwischen(von, bis).map((monat) => [
        monat,
        {
          monat,
          gewonnenAnzahl: 0,
          gewonnenSumme: 0,
          verlorenAnzahl: 0,
          verlorenSumme: 0,
        },
      ]),
    );

    for (const z of zeilen) {
      const eintrag = monate.get(z.tag.slice(0, 7));

      if (eintrag === undefined) {
        continue;
      }

      if (z.phase === 'won') {
        eintrag.gewonnenAnzahl += 1;
        eintrag.gewonnenSumme += Number(z.betrag);
      } else {
        eintrag.verlorenAnzahl += 1;
        eintrag.verlorenSumme += Number(z.betrag);
      }
    }

    return [...monate.values()];
  }

  private async jeVerkaeufer(
    zeilen: Zeile[],
    offen: { ownerId: string | null; anzahl: number; summe: number }[],
  ): Promise<AuswertungVerkaeuferDaten[]> {
    const verkaeufer = new Map<string, AuswertungVerkaeuferDaten>();
    const fuer = (id: string | null): AuswertungVerkaeuferDaten => {
      const vorhanden = verkaeufer.get(id ?? '');

      if (vorhanden !== undefined) {
        return vorhanden;
      }

      const neu: AuswertungVerkaeuferDaten = {
        ownerId: id,
        name: 'Ohne Verantwortlichen',
        offenAnzahl: 0,
        offenSumme: 0,
        gewonnenAnzahl: 0,
        gewonnenSumme: 0,
        verlorenAnzahl: 0,
        quote: null,
      };

      verkaeufer.set(id ?? '', neu);

      return neu;
    };

    for (const o of offen) {
      const eintrag = fuer(o.ownerId);

      eintrag.offenAnzahl = Number(o.anzahl);
      eintrag.offenSumme = Number(o.summe);
    }

    for (const z of zeilen) {
      const eintrag = fuer(z.ownerId);

      if (z.phase === 'won') {
        eintrag.gewonnenAnzahl += 1;
        eintrag.gewonnenSumme += Number(z.betrag);
      } else {
        eintrag.verlorenAnzahl += 1;
      }
    }

    const ids = [...verkaeufer.values()]
      .map((v) => v.ownerId)
      .filter((id): id is string => id !== null);
    const namen = new Map(
      (ids.length === 0
        ? []
        : await this.users.find({
            where: { id: In(ids) },
            select: ['id', 'firstName', 'lastName'],
          })
      ).map((u) => [u.id, `${u.firstName} ${u.lastName}`]),
    );

    for (const eintrag of verkaeufer.values()) {
      if (eintrag.ownerId !== null) {
        eintrag.name = namen.get(eintrag.ownerId) ?? 'Entfernter Benutzer';
      }

      eintrag.quote = quote(eintrag.gewonnenAnzahl, eintrag.verlorenAnzahl);
    }

    return [...verkaeufer.values()].sort(
      (a, b) =>
        b.gewonnenSumme - a.gewonnenSumme || b.offenSumme - a.offenSumme,
    );
  }

  private gruende(
    verloren: Zeile[],
  ): { grund: string; anzahl: number; summe: number }[] {
    const gruende = new Map<
      string,
      { grund: string; anzahl: number; summe: number }
    >();

    for (const z of verloren) {
      const grund = z.lostReason?.trim() || 'Ohne Angabe';
      const eintrag = gruende.get(grund) ?? { grund, anzahl: 0, summe: 0 };

      eintrag.anzahl += 1;
      eintrag.summe += Number(z.betrag);
      gruende.set(grund, eintrag);
    }

    return [...gruende.values()].sort(
      (a, b) => b.anzahl - a.anzahl || b.summe - a.summe,
    );
  }
}

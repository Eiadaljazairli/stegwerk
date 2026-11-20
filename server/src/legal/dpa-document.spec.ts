import { PAPIERKORB_TAGE } from '../papierkorb/papierkorb.service';
import { type PrivacyFacts } from '../privacy/privacy-facts';
import {
  dpaDocument,
  type DpaBlock,
  type DpaSection,
  MASSNAHMEN_IM_PROGRAMM,
  UNTERAUFTRAG_STAND,
  weitereAuftragsverarbeiter,
} from './dpa-document';

const leer: PrivacyFacts = {
  reviewed: false,
  dpaReviewed: false,
  hosting: null,
  privacyContact: null,
  supervisoryAuthority: null,
  backupDescription: null,
  billing: false,
  errorReporting: false,
  outgoingMail: false,
  mailboxes: false,
  retentionDays: 90,
  retentionEnabled: false,
  protokollAenderungenMonate: 24,
  protokollSicherheitMonate: 12,
};

const alleBloecke = (abschnitte: DpaSection[]): DpaBlock[] =>
  abschnitte.flatMap((abschnitt) => abschnitt.blocks);

const alsText = (bloecke: DpaBlock[]): string =>
  bloecke
    .map((block) =>
      block.kind === 'list' ? block.items.join(' ') : block.text,
    )
    .join(' ');

const anlage = (dokument: ReturnType<typeof dpaDocument>, label: string) => {
  const gefunden = dokument.annexes.find((a) => a.label === label);

  if (gefunden === undefined) throw new Error(`${label} fehlt`);

  return gefunden;
};

describe('was der Vertrag enthalten muss', () => {
  const dokument = dpaDocument(leer, 'Beispiel GmbH');

  it('deckt die Punkte aus Art. 28 Abs. 3 ab', () => {
    const titel = dokument.sections.map((s) => s.title).join(' | ');

    for (const stichwort of [
      'Gegenstand',
      'Weisung',
      'Vertraulichkeit',
      'Technische',
      'Unterauftrag',
      'Unterstützung',
      'Verletzungen',
      'Nachweise',
      'Löschung',
    ]) {
      expect(titel).toContain(stichwort);
    }
  });

  it('hat die drei Anlagen', () => {
    expect(dokument.annexes.map((a) => a.label)).toEqual([
      'Anlage 1',
      'Anlage 2',
      'Anlage 3',
    ]);
  });

  it('zählt die Datenarten auf, statt sie zusammenzufassen', () => {
    const listen = anlage(dokument, 'Anlage 1').blocks.filter(
      (b) => b.kind === 'list',
    );

    expect(listen.length).toBeGreaterThanOrEqual(2);
    expect(alsText(listen)).toContain('Passwort-Hash');
    expect(alsText(listen)).toContain('Protokolldaten');
  });
});

describe('keine Zusage, die die Software nicht hält', () => {
  it('erfindet keine Sicherung, wenn keine beschrieben ist', () => {
    const anlage2 = anlage(dpaDocument(leer, null), 'Anlage 2');
    const luecke = anlage2.blocks.find(
      (b) => b.kind === 'gap' && b.variable === 'LEGAL_BACKUP_DESCRIPTION',
    );

    expect(luecke).toBeDefined();
    expect(alsText(anlage2.blocks)).not.toMatch(
      /täglich gesichert|tägliche Sicherung/u,
    );
  });

  it('übernimmt die Beschreibung, wenn der Betreiber eine macht', () => {
    const anlage2 = anlage(
      dpaDocument(
        {
          ...leer,
          backupDescription: 'Täglich, 30 Tage, zuletzt erprobt 09/2026.',
        },
        null,
      ),
      'Anlage 2',
    );

    expect(alsText(anlage2.blocks)).toContain('zuletzt erprobt 09/2026');
    expect(
      anlage2.blocks.some(
        (b) => b.kind === 'gap' && b.variable === 'LEGAL_BACKUP_DESCRIPTION',
      ),
    ).toBe(false);
  });

  it('weist die fehlende Unterbringung als Lücke aus', () => {
    const anlage2 = anlage(dpaDocument(leer, null), 'Anlage 2');

    expect(
      anlage2.blocks.some(
        (b) => b.kind === 'gap' && b.variable === 'LEGAL_HOSTING',
      ),
    ).toBe(true);
  });

  it('verspricht keine automatische Löschung, wenn keine läuft', () => {
    const text = alsText(alleBloecke(dpaDocument(leer, null).sections));

    expect(text).toContain('nicht eingeschaltet');
    expect(text).not.toMatch(/nach 90 Tagen automatisch gelöscht/u);
  });

  it('nennt die Frist, wenn tatsächlich gelöscht wird', () => {
    const text = alsText(
      alleBloecke(
        dpaDocument(
          { ...leer, retentionEnabled: true, retentionDays: 180 },
          null,
        ).sections,
      ),
    );

    expect(text).toContain('180 Tagen automatisch gelöscht');
  });

  it('nennt das Postfach nur, wenn Postfächer möglich sind', () => {
    expect(
      alsText(anlage(dpaDocument(leer, null), 'Anlage 1').blocks),
    ).not.toContain('Postfach');
    expect(
      alsText(
        anlage(dpaDocument({ ...leer, mailboxes: true }, null), 'Anlage 1')
          .blocks,
      ),
    ).toContain('Postfach');
  });
});

describe('Anlage 3, die weiteren Auftragsverarbeiter', () => {
  it('sagt es, wenn keiner eingebunden ist', () => {
    expect(
      alsText(anlage(dpaDocument(leer, null), 'Anlage 3').blocks),
    ).toContain('kein weiterer Auftragsverarbeiter');
  });

  it.each([
    [{ hosting: 'Hetzner, Nürnberg' }, 'Hetzner'],
    [{ outgoingMail: true }, 'ausgehender E-Mail'],
    [{ billing: true }, 'Stripe'],
    [{ errorReporting: true }, 'Fehler'],
  ])('nennt einen eingerichteten Dienst (%o)', (teil, erwartet) => {
    const anlage3 = anlage(dpaDocument({ ...leer, ...teil }, null), 'Anlage 3');

    expect(alsText(anlage3.blocks)).toContain(erwartet);
  });

  it('nennt mehrere, wenn mehrere laufen', () => {
    const anlage3 = anlage(
      dpaDocument(
        { ...leer, hosting: 'Hetzner', outgoingMail: true, billing: true },
        null,
      ),
      'Anlage 3',
    );
    const eintraege = anlage3.blocks.find((b) => b.kind === 'list');

    expect(eintraege?.kind === 'list' ? eintraege.items.length : 0).toBe(3);
  });
});

describe('die Freigabe', () => {
  it('folgt dem Vertrags-Schalter, nicht dem der Erklärung', () => {
    expect(dpaDocument({ ...leer, reviewed: true }, null).reviewed).toBe(false);
    expect(dpaDocument({ ...leer, dpaReviewed: true }, null).reviewed).toBe(
      true,
    );
  });
});

describe('die öffentliche Liste der Unterauftragsverarbeiter', () => {
  const alle: PrivacyFacts = {
    ...leer,
    hosting: 'Beispiel-Hoster in Frankfurt',
    billing: true,
    errorReporting: true,
    outgoingMail: true,
  };

  it('ist dieselbe wie in Anlage 3', () => {
    const block = anlage(dpaDocument(alle, null), 'Anlage 3').blocks[1];

    expect(block.kind === 'list' ? block.items : []).toEqual(
      weitereAuftragsverarbeiter(alle),
    );
  });

  it('hält fest, was sie heute nennt', () => {
    expect(UNTERAUFTRAG_STAND).toBe('2026-10-20');
    expect(
      weitereAuftragsverarbeiter(alle).map((zeile) => zeile.slice(0, 24)),
    ).toEqual([
      'Betrieb und Speicherung:',
      'Versand ausgehender E-Ma',
      'Zahlungsabwicklung über ',
      'Auswertung technischer F',
    ]);
    expect(weitereAuftragsverarbeiter(leer)).toEqual([]);
  });

  it('nennt die Papierkorb-Frist, die der Code tatsächlich hat', () => {
    expect(MASSNAHMEN_IM_PROGRAMM.join(' ')).toContain(
      `${String(PAPIERKORB_TAGE)} Tage im Papierkorb`,
    );
  });

  it('nennt alle Cookies, auch das kurzlebige beim Verbinden über OAuth', () => {
    const text = MASSNAHMEN_IM_PROGRAMM.join(' ');

    expect(text).toContain('Erneuerungs-Cookie');
    expect(text).toContain('inhaltsloses Merkzeichen');
    expect(text).toContain('höchstens zehn Minuten ein Cookie');
  });

  it('behauptet keine cookielose Anwendung mehr', () => {
    expect(MASSNAHMEN_IM_PROGRAMM.join(' ')).not.toContain(
      'setzt keine Cookies',
    );
  });
});

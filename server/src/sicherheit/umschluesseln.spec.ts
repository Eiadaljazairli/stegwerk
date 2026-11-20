import { randomBytes } from 'node:crypto';
import { type DataSource } from 'typeorm';

import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { open, schluesselKennung, seal } from '../mailboxes/secret-box';
import { umschluesseln, VERSIEGELTE_SPALTEN } from './umschluesseln';

const alt = randomBytes(32);
const neu = randomBytes(32);
const bund = { primaer: neu, alte: [alt] };

const speicher = (werte: Record<string, string>) => {
  const schreibvorgaenge: unknown[][] = [];
  const abfrage = (sql: string, parameter?: unknown[]) => {
    if (sql.startsWith('SELECT')) {
      return Promise.resolve(
        sql.includes('"webhooks"')
          ? Object.entries(werte).map(([id, wert]) => ({ id, wert }))
          : [],
      );
    }

    const [neuerWert, id, vorher] = parameter as [string, string, string];

    schreibvorgaenge.push(parameter as unknown[]);

    if (werte[id] === vorher) {
      werte[id] = neuerWert;
    }

    return Promise.resolve([]);
  };

  return { abfrage, schreibvorgaenge, werte };
};

describe('umschluesseln', () => {
  it('versiegelt mit dem neuen Schlüssel, was der alte versiegelt hat', async () => {
    const tabelle = speicher({
      a: seal('geheim-a', alt),
      b: seal('geheim-b', neu),
    });

    const [bericht] = (
      await umschluesseln(tabelle.abfrage, { mail: bund, totp: null })
    ).filter((b) => b.tabelle === 'webhooks');

    expect(bericht).toMatchObject({ umgeschluesselt: 1, aktuell: 1 });
    expect(tabelle.werte.a.split(':')[1]).toBe(schluesselKennung(neu));
    expect(open(tabelle.werte.a, neu)).toBe('geheim-a');
  });

  it('lässt Unlesbares stehen und zählt es', async () => {
    const fremd = seal('weg', randomBytes(32));
    const tabelle = speicher({ a: fremd });

    const [bericht] = (
      await umschluesseln(tabelle.abfrage, { mail: bund, totp: null })
    ).filter((b) => b.tabelle === 'webhooks');

    expect(bericht.unlesbar).toBe(1);
    expect(tabelle.werte.a).toBe(fremd);
    expect(tabelle.schreibvorgaenge).toHaveLength(0);
  });

  it('schreibt im Probelauf nichts', async () => {
    const tabelle = speicher({ a: seal('x', alt) });

    const [bericht] = (
      await umschluesseln(
        tabelle.abfrage,
        { mail: bund, totp: null },
        { probelauf: true },
      )
    ).filter((b) => b.tabelle === 'webhooks');

    expect(bericht.umgeschluesselt).toBe(1);
    expect(tabelle.schreibvorgaenge).toHaveLength(0);
  });

  it('überspringt einen Schlüssel, der nicht gesetzt ist', async () => {
    const tabelle = speicher({});
    const berichte = await umschluesseln(tabelle.abfrage, {
      mail: bund,
      totp: null,
    });

    expect(berichte.some((b) => b.tabelle === 'users')).toBe(false);
  });
});

describe('die Kopfzeilen der Automationen', () => {
  it('versiegelt die Werte im JSON neu, in der Aktion und in jedem Schritt', async () => {
    const daten = {
      httpHeader: [
        { name: 'Authorization', wertSealed: seal('Bearer a', alt) },
      ],
    };
    const schritte = [
      {
        aktion: 'HTTP_ANFRAGE',
        daten: {
          httpHeader: [{ name: 'X-Token', wertSealed: seal('t-2', alt) }],
        },
      },
    ];
    const geschrieben: unknown[][] = [];
    const abfrage = (sql: string, parameter?: unknown[]) => {
      if (sql.startsWith('SELECT') && sql.includes('"aktionDaten"')) {
        return Promise.resolve([
          {
            id: 'r1',
            daten: JSON.stringify(daten),
            schritte: JSON.stringify(schritte),
          },
        ]);
      }

      if (sql.startsWith('UPDATE "automationen"')) {
        geschrieben.push(parameter as unknown[]);
      }

      return Promise.resolve([]);
    };

    const berichte = await umschluesseln(abfrage, { mail: bund, totp: null });
    const bericht = berichte.find((b) => b.spalte === 'httpHeader');

    expect(bericht).toMatchObject({ umgeschluesselt: 2, unlesbar: 0 });
    expect(geschrieben).toHaveLength(1);

    const [neueDaten, neueSchritte] = geschrieben[0] as [string, string];
    const kopf = (JSON.parse(neueDaten) as typeof daten).httpHeader[0]
      .wertSealed;
    const schrittKopf = (JSON.parse(neueSchritte) as typeof schritte)[0].daten
      .httpHeader[0].wertSealed;

    expect(kopf.split(':')[1]).toBe(schluesselKennung(neu));
    expect(open(kopf, neu)).toBe('Bearer a');
    expect(open(schrittKopf, neu)).toBe('t-2');
  });

  it('versiegelt die Adresse eines Slack- oder Teams-Kanals neu, auch ohne Kopfzeilen', async () => {
    const slack = 'https://hooks.slack.com/services/T0/B0/geheim';
    const teams = 'https://firma.webhook.office.com/webhookb2/geheim';
    const fremd = seal('https://weg.example/', randomBytes(32));
    const daten = { kanalDienst: 'slack', kanalUrlSealed: seal(slack, alt) };
    const schritte = [
      {
        aktion: 'KANAL_NACHRICHT',
        daten: { kanalDienst: 'teams', kanalUrlSealed: seal(teams, alt) },
      },
      {
        aktion: 'KANAL_NACHRICHT',
        daten: { kanalDienst: 'teams', kanalUrlSealed: fremd },
      },
    ];
    let gefragt = '';
    const geschrieben: unknown[][] = [];
    const abfrage = (sql: string, parameter?: unknown[]) => {
      if (sql.startsWith('SELECT') && sql.includes('"aktionDaten"')) {
        gefragt = sql;
        return Promise.resolve([
          {
            id: 'r1',
            daten: JSON.stringify(daten),
            schritte: JSON.stringify(schritte),
          },
        ]);
      }

      if (sql.startsWith('UPDATE "automationen"')) {
        geschrieben.push(parameter as unknown[]);
      }

      return Promise.resolve([]);
    };

    const berichte = await umschluesseln(abfrage, { mail: bund, totp: null });

    expect(gefragt).toContain(`"aktionDaten" ? 'kanalUrlSealed'`);
    expect(gefragt).toContain('$[*].daten.kanalUrlSealed');
    expect(berichte.find((b) => b.spalte === 'kanalUrlSealed')).toMatchObject({
      tabelle: 'automationen',
      umgeschluesselt: 2,
      aktuell: 0,
      unlesbar: 1,
    });
    expect(geschrieben).toHaveLength(1);

    const [neueDaten, neueSchritte] = geschrieben[0] as [string, string];
    const aktion = (JSON.parse(neueDaten) as typeof daten).kanalUrlSealed;
    const [erster, zweiter] = (JSON.parse(neueSchritte) as typeof schritte).map(
      (s) => s.daten.kanalUrlSealed,
    );

    expect(open(aktion, neu)).toBe(slack);
    expect(open(erster, neu)).toBe(teams);
    expect(() => open(aktion, { primaer: alt, alte: [] })).toThrow();
    expect(() => open(erster, { primaer: alt, alte: [] })).toThrow();
    expect(zweiter).toBe(fremd);
  });
});

describe('die Liste der versiegelten Spalten', () => {
  const SUITE = 'umschluesseln';
  let dataSource: DataSource;

  jest.setTimeout(60_000);

  beforeAll(async () => {
    dataSource = await createTestDatabase(SUITE);
  });

  afterAll(async () => {
    await dropTestDatabase(dataSource, SUITE);
  });

  it('nennt nur Spalten, die es gibt', async () => {
    for (const { tabelle, spalte } of VERSIEGELTE_SPALTEN) {
      const gefunden = (await dataSource.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_name = $1 AND column_name = $2`,
        [tabelle, spalte],
      )) as unknown[];

      expect({ tabelle, spalte, da: gefunden.length }).toEqual({
        tabelle,
        spalte,
        da: 1,
      });
    }
  });

  it('läuft gegen die echte Datenbank durch', async () => {
    const berichte = await umschluesseln(
      (sql, werte) => dataSource.query(sql, werte),
      { mail: bund, totp: bund },
    );

    expect(berichte).toHaveLength(VERSIEGELTE_SPALTEN.length + 2);
  });
});

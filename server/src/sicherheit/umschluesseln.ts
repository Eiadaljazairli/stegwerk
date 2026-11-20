import {
  mitAktuellemSchluessel,
  open,
  type Schluesselbund,
  seal,
} from '../mailboxes/secret-box';

export const VERSIEGELTE_SPALTEN: readonly {
  tabelle: string;
  spalte: string;
  schluessel: 'mail' | 'totp';
  kennung?: string;
}[] = [
  { tabelle: 'mailboxes', spalte: 'passwordSealed', schluessel: 'mail' },
  {
    tabelle: 'oauth_zugaenge',
    spalte: 'erneuerungVersiegelt',
    schluessel: 'mail',
  },
  {
    tabelle: 'oauth_zugaenge',
    spalte: 'zugriffVersiegelt',
    schluessel: 'mail',
  },
  {
    tabelle: 'oauth_vorgaenge',
    spalte: 'verifierVersiegelt',
    schluessel: 'mail',
    kennung: 'stateHash',
  },
  {
    tabelle: 'kalender_verbindungen',
    spalte: 'passwortVersiegelt',
    schluessel: 'mail',
  },
  { tabelle: 'webhooks', spalte: 'secretSealed', schluessel: 'mail' },
  {
    tabelle: 'automationen',
    spalte: 'eingangGeheimnisSealed',
    schluessel: 'mail',
  },
  {
    tabelle: 'buchhaltung_verbindungen',
    spalte: 'schluesselVersiegelt',
    schluessel: 'mail',
  },
  {
    tabelle: 'ki_einstellungen',
    spalte: 'schluesselVersiegelt',
    schluessel: 'mail',
  },
  { tabelle: 'users', spalte: 'totpSecret', schluessel: 'totp' },
];

export type UmschluesselBericht = {
  tabelle: string;
  spalte: string;
  umgeschluesselt: number;
  aktuell: number;
  unlesbar: number;
};

type Abfrage = (sql: string, werte?: unknown[]) => Promise<unknown>;

export const umschluesseln = async (
  abfrage: Abfrage,
  bunde: { mail: Schluesselbund | null; totp: Schluesselbund | null },
  { probelauf = false }: { probelauf?: boolean } = {},
): Promise<UmschluesselBericht[]> => {
  const berichte: UmschluesselBericht[] = [];

  for (const {
    tabelle,
    spalte,
    schluessel,
    kennung = 'id',
  } of VERSIEGELTE_SPALTEN) {
    const bund = bunde[schluessel];

    if (bund === null) {
      continue;
    }

    const bericht: UmschluesselBericht = {
      tabelle,
      spalte,
      umgeschluesselt: 0,
      aktuell: 0,
      unlesbar: 0,
    };
    const zeilen = (await abfrage(
      `SELECT "${kennung}" AS "id", "${spalte}" AS "wert" FROM "${tabelle}"
        WHERE "${spalte}" IS NOT NULL AND "${spalte}" <> ''`,
    )) as { id: string; wert: string }[];

    for (const { id, wert } of zeilen) {
      if (mitAktuellemSchluessel(wert, bund)) {
        bericht.aktuell += 1;
        continue;
      }

      let klartext: string;

      try {
        klartext = open(wert, bund);
      } catch {
        bericht.unlesbar += 1;
        continue;
      }

      if (!probelauf) {
        await abfrage(
          `UPDATE "${tabelle}" SET "${spalte}" = $1
            WHERE "${kennung}" = $2 AND "${spalte}" = $3`,
          [seal(klartext, bund), id, wert],
        );
      }

      bericht.umgeschluesselt += 1;
    }

    berichte.push(bericht);
  }

  if (bunde.mail !== null) {
    berichte.push(
      ...(await automationsKoepfe(abfrage, bunde.mail, { probelauf })),
    );
  }

  return berichte;
};

type Kopf = { name: string; wertSealed: string };
type MitKoepfen = {
  httpHeader?: Kopf[];
  kanalUrlSealed?: string | null;
} | null;

const automationsKoepfe = async (
  abfrage: Abfrage,
  bund: Schluesselbund,
  { probelauf }: { probelauf: boolean },
): Promise<UmschluesselBericht[]> => {
  const bericht = (spalte: string): UmschluesselBericht => ({
    tabelle: 'automationen',
    spalte,
    umgeschluesselt: 0,
    aktuell: 0,
    unlesbar: 0,
  });
  const koepfe = bericht('httpHeader');
  const kanaele = bericht('kanalUrlSealed');
  const zeilen = (await abfrage(
    `SELECT "id", "aktionDaten"::text AS "daten", "schritte"::text AS "schritte"
       FROM "automationen"
      WHERE "aktionDaten" ? 'httpHeader'
         OR "aktionDaten" ? 'kanalUrlSealed'
         OR jsonb_path_exists("schritte", '$[*].daten.httpHeader')
         OR jsonb_path_exists("schritte", '$[*].daten.kanalUrlSealed')`,
  )) as { id: string; daten: string; schritte: string }[];

  for (const zeile of zeilen) {
    let geaendert = false;
    const neuerWert = (wert: string, zaehler: UmschluesselBericht): string => {
      if (mitAktuellemSchluessel(wert, bund)) {
        zaehler.aktuell += 1;
        return wert;
      }

      try {
        const neu = seal(open(wert, bund), bund);

        zaehler.umgeschluesselt += 1;
        geaendert = true;
        return neu;
      } catch {
        zaehler.unlesbar += 1;
        return wert;
      }
    };
    const neu = (d: MitKoepfen): void => {
      for (const kopf of d?.httpHeader ?? []) {
        kopf.wertSealed = neuerWert(kopf.wertSealed, koepfe);
      }

      if (d?.kanalUrlSealed) {
        d.kanalUrlSealed = neuerWert(d.kanalUrlSealed, kanaele);
      }
    };
    const daten = JSON.parse(zeile.daten) as MitKoepfen;
    const schritte = JSON.parse(zeile.schritte) as { daten: MitKoepfen }[];

    neu(daten);
    schritte.forEach((schritt) => neu(schritt.daten));

    if (geaendert && !probelauf) {
      await abfrage(
        `UPDATE "automationen" SET "aktionDaten" = $1::jsonb, "schritte" = $2::jsonb
          WHERE "id" = $3 AND "aktionDaten"::text = $4 AND "schritte"::text = $5`,
        [
          JSON.stringify(daten),
          JSON.stringify(schritte),
          zeile.id,
          zeile.daten,
          zeile.schritte,
        ],
      );
    }
  }

  return [koepfe, kanaele];
};

export type FehlerArt = 'voruebergehend' | 'anmeldung' | 'sonstig';

const MINUTE_MS = 60_000;

export const ERSTER_ABSTAND_MS = 10 * MINUTE_MS;

export const LAENGSTER_ABSTAND_MS = 6 * 60 * MINUTE_MS;

export const STUENDLICH_MS = 60 * MINUTE_MS;

export const BANNER_AB_VERSUCHEN = 3;

export const MAIL_NACH_MS = 24 * 60 * MINUTE_MS;

const ANMELDUNG =
  /anmeld|passwort|widerrufen|neu verbinden|zugriff.{0,40}abgelehnt/iu;

const VORUEBERGEHEND =
  /nicht erreichbar|keine verbindung|zeitüberschreitung|zu lange|vorübergehend|überlastet|später erneut/iu;

export const fehlerArtVon = (grund: string): FehlerArt => {
  if (ANMELDUNG.test(grund)) {
    return 'anmeldung';
  }

  if (VORUEBERGEHEND.test(grund)) {
    return 'voruebergehend';
  }

  return 'sonstig';
};

export type FehlerStand = {
  fehlerArt: FehlerArt | null;
  fehlversuche: number;
  fehlerSeit: Date | null;
  fehlerMailAm: Date | null;
};

export const nachFehler = (
  vorher: Pick<FehlerStand, 'fehlversuche' | 'fehlerSeit'>,
  grund: string,
  jetzt: Date,
): Omit<FehlerStand, 'fehlerMailAm'> => ({
  fehlerArt: fehlerArtVon(grund),
  fehlversuche: (vorher.fehlversuche ?? 0) + 1,
  fehlerSeit: vorher.fehlerSeit ?? jetzt,
});

export const nachErfolg = (): FehlerStand => ({
  fehlerArt: null,
  fehlversuche: 0,
  fehlerSeit: null,
  fehlerMailAm: null,
});

export const abstandNach = (
  stand: Pick<FehlerStand, 'fehlerArt' | 'fehlversuche'>,
): number => {
  if (stand.fehlerArt !== 'voruebergehend') {
    return STUENDLICH_MS;
  }

  const versuche = Math.max(1, stand.fehlversuche);

  return Math.min(
    ERSTER_ABSTAND_MS * 2 ** Math.min(versuche - 1, 20),
    LAENGSTER_ABSTAND_MS,
  );
};

export const wiederFaellig = (
  stand: Pick<FehlerStand, 'fehlerArt' | 'fehlversuche'>,
  letzterVersuch: Date | null,
  jetzt: Date,
): boolean =>
  letzterVersuch === null ||
  jetzt.getTime() - letzterVersuch.getTime() >= abstandNach(stand) - MINUTE_MS;

export const wiederFaelligSql = (
  letzterVersuch: string,
): { sql: string; parameter: Record<string, number> } => ({
  sql: `(${letzterVersuch} IS NULL OR ${letzterVersuch} <= :wfJetzt::timestamptz - (
      CASE WHEN "fehlerArt" = 'voruebergehend'
           THEN LEAST(:wfErster::bigint * power(2, LEAST(GREATEST(COALESCE("fehlversuche", 0), 1) - 1, 20))::bigint, :wfLaengster::bigint)
           ELSE :wfStuendlich::bigint
      END - :wfMinute::bigint) * interval '1 millisecond')`,
  parameter: {
    wfErster: ERSTER_ABSTAND_MS,
    wfLaengster: LAENGSTER_ABSTAND_MS,
    wfStuendlich: STUENDLICH_MS,
    wfMinute: MINUTE_MS,
  },
});

export const fehlerZeigen = (
  stand: Pick<FehlerStand, 'fehlerArt' | 'fehlversuche'> & {
    fehler: string | null;
  },
): boolean =>
  stand.fehler !== null &&
  stand.fehler !== '' &&
  (stand.fehlerArt !== 'voruebergehend' ||
    stand.fehlversuche >= BANNER_AB_VERSUCHEN);

export const mailFaellig = (stand: FehlerStand, jetzt: Date): boolean =>
  stand.fehlerSeit !== null &&
  stand.fehlerMailAm === null &&
  stand.fehlversuche > 0 &&
  jetzt.getTime() - stand.fehlerSeit.getTime() >= MAIL_NACH_MS;

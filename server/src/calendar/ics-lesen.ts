import { berlinDate, instantFromBerlin } from './berlin-time';

export type GelesenerTeilnehmer = {
  email: string;
  name: string | null;
  partstat: string;
};

export type GelesenerTermin = {
  uid: string;
  titel: string;
  beschreibung: string | null;
  ort: string | null;
  url: string | null;
  startsAt: Date;
  endsAt: Date;
  ganztaegig: boolean;
  regel: string | null;
  geaendertAm: Date | null;
  abgesagt: boolean;
  sequenz: number;
  organisator: string | null;
  teilnehmer: GelesenerTeilnehmer[];
  ausfaelle: string[];
  serienTag: string | null;
  privat: boolean;
};

export type GeleseneDatei = {
  methode: string | null;
  termine: GelesenerTermin[];
  ausnahmen: GelesenerTermin[];
};

type Zeile = { name: string; params: Record<string, string>; wert: string };

const entfalten = (text: string): string[] =>
  text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
    .filter((zeile) => zeile.trim() !== '');

const zerlege = (roh: string): Zeile | null => {
  let inAnfuehrung = false;
  let trenn = -1;

  for (let i = 0; i < roh.length; i += 1) {
    const zeichen = roh[i];

    if (zeichen === '"') {
      inAnfuehrung = !inAnfuehrung;
    } else if (zeichen === ':' && !inAnfuehrung) {
      trenn = i;
      break;
    }
  }

  if (trenn < 0) {
    return null;
  }

  const kopf = roh.slice(0, trenn);
  const wert = roh.slice(trenn + 1);
  const teile = kopf.match(/(?:[^;"]|"[^"]*")+/g) ?? [];
  const name = (teile.shift() ?? '').toUpperCase();
  const params: Record<string, string> = {};

  for (const teil of teile) {
    const gleich = teil.indexOf('=');

    if (gleich > 0) {
      params[teil.slice(0, gleich).toUpperCase()] = teil
        .slice(gleich + 1)
        .replace(/^"|"$/g, '');
    }
  }

  return { name, params, wert };
};

export const unescapeText = (wert: string): string =>
  wert.replace(/\\([nN,;\\])/g, (_, zeichen: string) =>
    zeichen === 'n' || zeichen === 'N' ? '\n' : zeichen,
  );

const WINDOWS_ZONEN: Record<string, string> = {
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Romance Standard Time': 'Europe/Paris',
  'GMT Standard Time': 'Europe/London',
  UTC: 'UTC',
};

const zoneGueltig = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });

    return true;
  } catch {
    return false;
  }
};

const abstandMs = (zone: string, zeitpunkt: Date): number => {
  const teile = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(zeitpunkt);
  const teil = (typ: string) =>
    Number(teile.find((eintrag) => eintrag.type === typ)?.value ?? 0);
  const alsUtc = Date.UTC(
    teil('year'),
    teil('month') - 1,
    teil('day'),
    teil('hour'),
    teil('minute'),
    teil('second'),
  );

  return alsUtc - Math.floor(zeitpunkt.getTime() / 1000) * 1000;
};

const wandzeit = (
  datum: string,
  uhrzeit: string,
  zone: string | undefined,
): Date => {
  const name =
    zone === undefined
      ? undefined
      : (WINDOWS_ZONEN[zone] ?? zone.replace(/^\//, ''));

  if (name === undefined || !zoneGueltig(name) || name === 'Europe/Berlin') {
    return instantFromBerlin(datum, uhrzeit.slice(0, 5));
  }

  const naiv = Date.parse(`${datum}T${uhrzeit}Z`);
  const erst = naiv - abstandMs(name, new Date(naiv));

  return new Date(naiv - abstandMs(name, new Date(erst)));
};

const zeitpunkt = (
  zeile: Zeile,
): { zeit: Date; ganztaegig: boolean } | null => {
  const wert = zeile.wert.trim();
  const nurDatum = /^(\d{4})(\d{2})(\d{2})$/.exec(wert);

  if (nurDatum !== null) {
    return {
      zeit: instantFromBerlin(
        `${nurDatum[1]}-${nurDatum[2]}-${nurDatum[3]}`,
        '00:00',
      ),
      ganztaegig: true,
    };
  }

  const mitZeit = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(
    wert,
  );

  if (mitZeit === null) {
    return null;
  }

  const datum = `${mitZeit[1]}-${mitZeit[2]}-${mitZeit[3]}`;
  const uhrzeit = `${mitZeit[4]}:${mitZeit[5]}:${mitZeit[6]}`;

  if (mitZeit[7] === 'Z') {
    return { zeit: new Date(`${datum}T${uhrzeit}Z`), ganztaegig: false };
  }

  return {
    zeit: wandzeit(datum, uhrzeit, zeile.params.TZID),
    ganztaegig: false,
  };
};

export const dauerMs = (wert: string): number | null => {
  const treffer =
    /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
      wert.trim(),
    );

  if (treffer === null) {
    return null;
  }

  const [, vorzeichen, w, d, h, m, s] = treffer;
  const ms =
    ((Number(w ?? 0) * 7 + Number(d ?? 0)) * 86_400 +
      Number(h ?? 0) * 3600 +
      Number(m ?? 0) * 60 +
      Number(s ?? 0)) *
    1000;

  return vorzeichen === '-' ? -ms : ms;
};

const adresse = (wert: string): string | null => {
  const ohne = wert
    .replace(/^mailto:/i, '')
    .trim()
    .toLowerCase();

  return ohne.includes('@') ? ohne : null;
};

export const liesIcs = (text: string): GeleseneDatei => {
  const gelesen: GelesenerTermin[] = [];
  let methode: string | null = null;
  let block: Zeile[] | null = null;
  let tiefe = 0;

  for (const roh of entfalten(text)) {
    const zeile = zerlege(roh);

    if (zeile === null) {
      continue;
    }

    if (zeile.name === 'METHOD' && block === null) {
      methode = zeile.wert.trim().toUpperCase();
      continue;
    }

    if (zeile.name === 'BEGIN' && zeile.wert.toUpperCase() === 'VEVENT') {
      block = [];
      tiefe = 0;
      continue;
    }

    if (block === null) {
      continue;
    }

    if (zeile.name === 'BEGIN') {
      tiefe += 1;
      continue;
    }

    if (zeile.name === 'END' && tiefe > 0) {
      tiefe -= 1;
      continue;
    }

    if (zeile.name === 'END' && zeile.wert.toUpperCase() === 'VEVENT') {
      const termin = baue(block);

      if (termin !== null) {
        gelesen.push(termin);
      }

      block = null;
      continue;
    }

    if (tiefe === 0) {
      block.push(zeile);
    }
  }

  const serien = new Set(
    gelesen
      .filter((termin) => termin.serienTag === null)
      .map((termin) => termin.uid),
  );
  const termine: GelesenerTermin[] = [];
  const ausnahmen: GelesenerTermin[] = [];

  for (const termin of gelesen) {
    if (termin.serienTag === null) {
      termine.push(termin);
    } else if (serien.has(termin.uid)) {
      ausnahmen.push(termin);
    } else {
      termine.push(termin);
    }
  }

  return { methode, termine, ausnahmen };
};

const tagVon = (zeile: Zeile, wert: string): string | null => {
  const zeit = zeitpunkt({ ...zeile, wert });

  if (zeit === null) {
    return null;
  }

  return zeit.ganztaegig
    ? `${wert.slice(0, 4)}-${wert.slice(4, 6)}-${wert.slice(6, 8)}`
    : berlinDate(zeit.zeit);
};

const baue = (zeilen: Zeile[]): GelesenerTermin | null => {
  const erste = (name: string) => zeilen.find((zeile) => zeile.name === name);

  const kennung = erste('RECURRENCE-ID');
  const serienTag =
    kennung === undefined ? null : tagVon(kennung, kennung.wert.trim());

  if (kennung !== undefined && serienTag === null) {
    return null;
  }

  const uid = erste('UID')?.wert.trim();
  const start = erste('DTSTART');

  if (uid === undefined || uid === '' || start === undefined) {
    return null;
  }

  const anfang = zeitpunkt(start);

  if (anfang === null) {
    return null;
  }

  const endeZeile = erste('DTEND');
  const ende = endeZeile === undefined ? null : zeitpunkt(endeZeile);
  const dauer = erste('DURATION');
  let endsAt: Date;

  if (ende !== null) {
    endsAt = ende.zeit;
  } else if (dauer !== undefined && dauerMs(dauer.wert) !== null) {
    endsAt = new Date(anfang.zeit.getTime() + (dauerMs(dauer.wert) ?? 0));
  } else {
    endsAt = new Date(
      anfang.zeit.getTime() + (anfang.ganztaegig ? 86_400_000 : 3_600_000),
    );
  }

  if (endsAt.getTime() <= anfang.zeit.getTime()) {
    endsAt = new Date(anfang.zeit.getTime() + 3_600_000);
  }

  const text = (name: string): string | null => {
    const wert = erste(name)?.wert;

    return wert === undefined || wert.trim() === ''
      ? null
      : unescapeText(wert).trim();
  };

  const geaendert = erste('LAST-MODIFIED') ?? erste('DTSTAMP');
  const geaendertAm =
    geaendert === undefined ? null : (zeitpunkt(geaendert)?.zeit ?? null);
  const organisator = erste('ORGANIZER');

  return {
    uid,
    titel: text('SUMMARY') ?? '',
    beschreibung: text('DESCRIPTION'),
    ort: text('LOCATION'),
    url: erste('URL')?.wert.trim() || null,
    startsAt: anfang.zeit,
    endsAt,
    ganztaegig: anfang.ganztaegig,
    regel: serienTag === null ? (erste('RRULE')?.wert.trim() ?? null) : null,
    serienTag,
    ausfaelle: [
      ...new Set(
        zeilen
          .filter((zeile) => zeile.name === 'EXDATE')
          .flatMap((zeile) =>
            zeile.wert
              .split(',')
              .map((wert) => tagVon(zeile, wert.trim()))
              .filter((tag): tag is string => tag !== null),
          ),
      ),
    ].sort(),
    geaendertAm,
    abgesagt: erste('STATUS')?.wert.trim().toUpperCase() === 'CANCELLED',
    privat: ['PRIVATE', 'CONFIDENTIAL'].includes(
      erste('CLASS')?.wert.trim().toUpperCase() ?? '',
    ),
    sequenz: Number(erste('SEQUENCE')?.wert ?? 0) || 0,
    organisator: organisator === undefined ? null : adresse(organisator.wert),
    teilnehmer: zeilen
      .filter((zeile) => zeile.name === 'ATTENDEE')
      .flatMap((zeile) => {
        const email = adresse(zeile.wert);

        return email === null
          ? []
          : [
              {
                email,
                name: zeile.params.CN ?? null,
                partstat: (
                  zeile.params.PARTSTAT ?? 'NEEDS-ACTION'
                ).toUpperCase(),
              },
            ];
      }),
  };
};

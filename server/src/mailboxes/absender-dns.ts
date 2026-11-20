import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

export type SpfStand = 'ok' | 'ohneServer' | 'fehlt' | 'unbekannt';
export type DmarcStand =
  | 'reject'
  | 'quarantine'
  | 'none'
  | 'fehlt'
  | 'unbekannt';
export type Ampel = 'gut' | 'hinweis' | 'problem';

export type AbsenderPruefung = {
  domain: string;
  spf: SpfStand;
  dmarc: DmarcStand;
  ampel: Ampel;
  hinweise: string[];
};

export type DnsLeser = {
  resolveTxt(name: string): Promise<string[][]>;
  resolve4(name: string): Promise<string[]>;
  resolve6(name: string): Promise<string[]>;
  resolveMx(name: string): Promise<{ exchange: string; priority: number }[]>;
};

export const systemDns: DnsLeser = {
  resolveTxt: (name) => dns.resolveTxt(name),
  resolve4: (name) => dns.resolve4(name),
  resolve6: (name) => dns.resolve6(name),
  resolveMx: (name) => dns.resolveMx(name),
};

export const ZEITLIMIT_MS = 3_000;
const HOECHSTENS_ABFRAGEN = 10;

class Zeitlimit extends Error {}

export const domainVon = (adresse: string): string | null => {
  const at = adresse.lastIndexOf('@');
  const domain = (at === -1 ? adresse : adresse.slice(at + 1))
    .trim()
    .toLowerCase()
    .replace(/\.$/u, '');

  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(
    domain,
  )
    ? domain
    : null;
};

const alsZahl = (ip: string): { zahl: bigint; bits: number } | null => {
  if (isIP(ip) === 4) {
    return {
      zahl: ip
        .split('.')
        .reduce((summe, teil) => (summe << 8n) + BigInt(Number(teil)), 0n),
      bits: 32,
    };
  }

  if (isIP(ip) === 6) {
    let rein = ip.toLowerCase();
    const v4 = /(\d+\.\d+\.\d+\.\d+)$/u.exec(rein);

    if (v4 !== null) {
      const z = alsZahl(v4[1]);

      if (z === null) {
        return null;
      }

      const hex = z.zahl.toString(16).padStart(8, '0');

      rein = `${rein.slice(0, -v4[1].length)}${hex.slice(0, 4)}:${hex.slice(4)}`;
    }

    const [vorn, hinten] = rein.split('::');
    const links = vorn === '' ? [] : vorn.split(':');
    const rechts =
      hinten === undefined || hinten === '' ? [] : hinten.split(':');
    const fehlend = 8 - links.length - rechts.length;
    const gruppen =
      hinten === undefined
        ? links
        : [
            ...links,
            ...Array<string>(Math.max(fehlend, 0)).fill('0'),
            ...rechts,
          ];

    if (gruppen.length !== 8) {
      return null;
    }

    return {
      zahl: gruppen.reduce(
        (summe, teil) => (summe << 16n) + BigInt(parseInt(teil || '0', 16)),
        0n,
      ),
      bits: 128,
    };
  }

  return null;
};

export const imNetz = (ip: string, netz: string): boolean => {
  const [adresse, laenge] = netz.split('/');
  const a = alsZahl(ip);
  const n = alsZahl(adresse ?? '');

  if (a === null || n === null || a.bits !== n.bits) {
    return false;
  }

  const praefix = laenge === undefined ? a.bits : Number(laenge);

  if (!Number.isInteger(praefix) || praefix < 0 || praefix > a.bits) {
    return false;
  }

  const verschiebung = BigInt(a.bits - praefix);

  return a.zahl >> verschiebung === n.zahl >> verschiebung;
};

export const spfEintrag = (txt: string[][]): string | null =>
  txt
    .map((teile) => teile.join(''))
    .find((zeile) => /^v=spf1(\s|$)/iu.test(zeile.trim())) ?? null;

export const dmarcRichtlinie = (
  txt: string[][],
): 'reject' | 'quarantine' | 'none' | null => {
  const zeile = txt
    .map((teile) => teile.join(''))
    .find((eintrag) => /^v=DMARC1\s*(;|$)/iu.test(eintrag.trim()));

  if (zeile === undefined) {
    return null;
  }

  const p = /(?:^|;)\s*p\s*=\s*(reject|quarantine|none)\s*(?:;|$)/iu.exec(
    zeile,
  );

  return p === null
    ? 'none'
    : (p[1].toLowerCase() as 'reject' | 'quarantine' | 'none');
};

const spfDeckt = async (
  leser: DnsLeser,
  domain: string,
  ips: string[],
  budget: { rest: number },
  tiefe = 0,
): Promise<boolean> => {
  if (tiefe > 5 || budget.rest <= 0) {
    return false;
  }

  budget.rest -= 1;

  const eintrag = spfEintrag(await leser.resolveTxt(domain).catch(() => []));

  if (eintrag === null) {
    return false;
  }

  const adressenVon = async (name: string): Promise<string[]> => {
    budget.rest -= 1;

    return [
      ...(await leser.resolve4(name).catch(() => [])),
      ...(await leser.resolve6(name).catch(() => [])),
    ];
  };

  let umleitung: string | null = null;

  for (const roh of eintrag.trim().split(/\s+/u).slice(1)) {
    const begriff = roh.replace(/^[+?~-]/u, '').toLowerCase();
    const [art, wert] = begriff.includes(':')
      ? [
          begriff.slice(0, begriff.indexOf(':')),
          begriff.slice(begriff.indexOf(':') + 1),
        ]
      : [begriff.split('/')[0], null];

    if (budget.rest <= 0) {
      return false;
    }

    if ((art === 'ip4' || art === 'ip6') && wert !== null) {
      if (ips.some((ip) => imNetz(ip, wert))) {
        return true;
      }
    } else if (art === 'a') {
      const [name] = (wert ?? domain).split('/');

      if ((await adressenVon(name)).some((ip) => ips.includes(ip))) {
        return true;
      }
    } else if (art === 'mx') {
      budget.rest -= 1;

      const mx = await leser.resolveMx(wert ?? domain).catch(() => []);

      for (const eintragMx of mx.slice(0, 5)) {
        if (
          (await adressenVon(eintragMx.exchange)).some((ip) => ips.includes(ip))
        ) {
          return true;
        }
      }
    } else if (art === 'include' && wert !== null) {
      if (await spfDeckt(leser, wert, ips, budget, tiefe + 1)) {
        return true;
      }
    } else if (begriff.startsWith('redirect=')) {
      umleitung = begriff.slice('redirect='.length);
    }
  }

  return umleitung === null
    ? false
    : spfDeckt(leser, umleitung, ips, budget, tiefe + 1);
};

export const bewerte = (
  spf: SpfStand,
  dmarc: DmarcStand,
): { ampel: Ampel; hinweise: string[] } => {
  const hinweise: string[] = [];

  if (spf === 'fehlt') {
    hinweise.push(
      'Für die Domain gibt es keinen SPF-Eintrag. Empfänger können nicht prüfen, ob Ihr Mailserver für sie senden darf. Ihr Mail-Anbieter nennt den Eintrag, der ins DNS gehört.',
    );
  } else if (spf === 'ohneServer') {
    hinweise.push(
      'Der SPF-Eintrag nennt Ihren Postausgang nicht erkennbar. Das kann trotzdem stimmen (manche Anbieter senden über andere Server), lohnt aber einen Blick mit dem Anbieter.',
    );
  }

  if (dmarc === 'fehlt') {
    hinweise.push(
      'Für die Domain gibt es keinen DMARC-Eintrag. Gmail und Microsoft verlangen ihn für größere Sendungen; ein Eintrag „v=DMARC1; p=none“ unter _dmarc genügt für den Anfang.',
    );
  } else if (dmarc === 'none') {
    hinweise.push(
      'DMARC steht auf „none“: Empfänger werten nur aus und weisen nichts ab. Für Serienmails reicht das; strenger („quarantine“) schützt die Domain besser vor Fälschern.',
    );
  }

  if (spf === 'unbekannt' || dmarc === 'unbekannt') {
    hinweise.push(
      'Das DNS hat nicht rechtzeitig geantwortet. Bitte später noch einmal prüfen.',
    );
  }

  const ampel: Ampel =
    spf === 'fehlt' || dmarc === 'fehlt'
      ? 'problem'
      : spf === 'ok' && (dmarc === 'quarantine' || dmarc === 'reject')
        ? 'gut'
        : 'hinweis';

  return { ampel, hinweise };
};

const mitZeitlimit = <T>(arbeit: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((fertig, abbruch) => {
    const zeitgeber = setTimeout(() => abbruch(new Zeitlimit()), ms);

    zeitgeber.unref?.();
    arbeit.then(
      (wert) => {
        clearTimeout(zeitgeber);
        fertig(wert);
      },
      (fehler: unknown) => {
        clearTimeout(zeitgeber);
        abbruch(fehler);
      },
    );
  });

export const pruefeAbsender = async (
  adresse: string,
  smtpHost: string | null,
  leser: DnsLeser = systemDns,
  zeitlimit = ZEITLIMIT_MS,
): Promise<AbsenderPruefung | null> => {
  const domain = domainVon(adresse);

  if (domain === null) {
    return null;
  }

  const spfFrage = async (): Promise<SpfStand> => {
    const eintrag = spfEintrag(await leser.resolveTxt(domain).catch(() => []));

    if (eintrag === null) {
      return 'fehlt';
    }

    const host = smtpHost?.trim().toLowerCase() ?? '';

    if (host === '') {
      return 'ok';
    }

    const ips =
      isIP(host) !== 0
        ? [host]
        : [
            ...(await leser.resolve4(host).catch(() => [])),
            ...(await leser.resolve6(host).catch(() => [])),
          ];

    if (ips.length === 0) {
      return 'ohneServer';
    }

    return (await spfDeckt(leser, domain, ips, {
      rest: HOECHSTENS_ABFRAGEN,
    }))
      ? 'ok'
      : 'ohneServer';
  };

  const dmarcFrage = async (): Promise<DmarcStand> => {
    const txt = await leser.resolveTxt(`_dmarc.${domain}`).catch(() => []);

    return dmarcRichtlinie(txt) ?? 'fehlt';
  };

  const [spf, dmarc] = await Promise.all([
    mitZeitlimit(spfFrage(), zeitlimit).catch((): SpfStand => 'unbekannt'),
    mitZeitlimit(dmarcFrage(), zeitlimit).catch((): DmarcStand => 'unbekannt'),
  ]);

  return { domain, spf, dmarc, ...bewerte(spf, dmarc) };
};

const ZWISCHENSPEICHER_MS = 10 * 60_000;

const FRISCH_AB_MS = 30_000;

export type GemerktePruefung = AbsenderPruefung & { geprueftAm: Date };

const zwischenspeicher = new Map<
  string,
  { bis: number; am: number; ergebnis: AbsenderPruefung | null }
>();

export const pruefeAbsenderGemerkt = async (
  adresse: string,
  smtpHost: string | null,
  jetzt = Date.now(),
  leser: DnsLeser = systemDns,
  frisch = false,
): Promise<GemerktePruefung | null> => {
  const schluessel = `${domainVon(adresse) ?? adresse}|${smtpHost ?? ''}`;
  const gemerkt = zwischenspeicher.get(schluessel);

  if (
    gemerkt !== undefined &&
    gemerkt.bis > jetzt &&
    !(frisch && jetzt - gemerkt.am >= FRISCH_AB_MS)
  ) {
    return gemerkt.ergebnis === null
      ? null
      : { ...gemerkt.ergebnis, geprueftAm: new Date(gemerkt.am) };
  }

  const ergebnis = await pruefeAbsender(adresse, smtpHost, leser);

  if (zwischenspeicher.size > 1000) {
    zwischenspeicher.clear();
  }

  zwischenspeicher.set(schluessel, {
    bis: jetzt + ZWISCHENSPEICHER_MS,
    am: jetzt,
    ergebnis,
  });

  return ergebnis === null
    ? null
    : { ...ergebnis, geprueftAm: new Date(jetzt) };
};

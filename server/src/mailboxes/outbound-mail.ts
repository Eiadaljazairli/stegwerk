import { randomUUID } from 'node:crypto';

import { domainOf, normaliseAddress } from './address-match';
import { normalisiereId, zerlegeReferences } from './mail-threading';

export const MAX_EMPFAENGER = 20;

export const MAX_BETREFF = 200;

export const MAX_RUMPF = 100_000;

const VERBOTEN = /[\r\n\0]/u;

export const kopfzeilenSicher = (wert: string): boolean => !VERBOTEN.test(wert);

export const pruefeBetreff = (roh: string): string | null => {
  if (!kopfzeilenSicher(roh)) {
    return null;
  }

  const sauber = roh.trim();

  return sauber.length > MAX_BETREFF ? null : sauber;
};

export const pruefeEmpfaenger = (roh: string): string | null => {
  if (!kopfzeilenSicher(roh)) {
    return null;
  }

  const adresse = normaliseAddress(roh);

  if (adresse === '' || adresse.length > 320) {
    return null;
  }

  return /^[^\s@,<>"]+@[^\s@,<>".]+\.[^\s@,<>".]{2,}$/u.test(adresse)
    ? adresse
    : null;
};

export type Empfaengerpruefung =
  | { ok: true; adressen: string[] }
  | { ok: false; grund: string };

export const pruefeEmpfaengerliste = (rohe: string[]): Empfaengerpruefung => {
  if (rohe.length === 0) {
    return { ok: false, grund: 'Ohne Empfänger.' };
  }

  if (rohe.length > MAX_EMPFAENGER) {
    return {
      ok: false,
      grund:
        `Höchstens ${String(MAX_EMPFAENGER)} Empfänger je Nachricht. ` +
        'Für Rundschreiben ist dies das falsche Werkzeug.',
    };
  }

  const geprueft: string[] = [];

  for (const roh of rohe) {
    const adresse = pruefeEmpfaenger(roh);

    if (adresse === null) {
      return {
        ok: false,
        grund: `Keine brauchbare Adresse: ${roh.slice(0, 80)}`,
      };
    }

    if (!geprueft.includes(adresse)) {
      geprueft.push(adresse);
    }
  }

  return { ok: true, adressen: geprueft };
};

export const neueKennung = (
  absender: string,
  zufall: string = randomUUID(),
): string => {
  const domain = domainOf(normaliseAddress(absender));

  return `${zufall}@${domain === '' ? 'localhost' : domain}`;
};

export type Antwortkopf = {
  inReplyTo: string | null;
  references: string | null;
};

export const antwortkopf = (
  eltern: { messageId: string; references: string | null } | null,
  maxKette = 20,
): Antwortkopf => {
  if (eltern === null) {
    return { inReplyTo: null, references: null };
  }

  const vorgaenger = normalisiereId(eltern.messageId);

  if (vorgaenger === null) {
    return { inReplyTo: null, references: null };
  }

  const kette = zerlegeReferences(eltern.references).filter(
    (id) => id !== vorgaenger,
  );

  kette.push(vorgaenger);

  const gekuerzt =
    kette.length <= maxKette
      ? kette
      : [...kette.slice(0, maxKette - 5), ...kette.slice(-5)];

  return {
    inReplyTo: `<${vorgaenger}>`,
    references: gekuerzt.map((id) => `<${id}>`).join(' '),
  };
};

export type GeprueftePost = {
  an: string[];
  cc: string[];
  bcc: string[];
  betreff: string;
  rumpf: string;
  kennung: string;
  inReplyTo: string | null;
  references: string | null;
};

export type Pruefergebnis =
  | { ok: true; post: GeprueftePost }
  | { ok: false; grund: string };

export const pruefePost = (
  eingabe: {
    an: string[];
    cc?: string[];
    bcc?: string[];
    betreff: string;
    rumpf: string;
    absender: string;
  },
  eltern: { messageId: string; references: string | null } | null = null,
  zufall?: string,
): Pruefergebnis => {
  const empfaenger = pruefeEmpfaengerliste(eingabe.an);

  if (!empfaenger.ok) {
    return { ok: false, grund: empfaenger.grund };
  }

  const kopien: string[][] = [];

  for (const liste of [eingabe.cc ?? [], eingabe.bcc ?? []]) {
    if (liste.length === 0) {
      kopien.push([]);
      continue;
    }

    const geprueft = pruefeEmpfaengerliste(liste);

    if (!geprueft.ok) {
      return { ok: false, grund: geprueft.grund };
    }

    kopien.push(geprueft.adressen);
  }

  const cc = (kopien[0] ?? []).filter(
    (adresse) => !empfaenger.adressen.includes(adresse),
  );
  const bcc = (kopien[1] ?? []).filter(
    (adresse) =>
      !empfaenger.adressen.includes(adresse) && !cc.includes(adresse),
  );

  if (empfaenger.adressen.length + cc.length + bcc.length > MAX_EMPFAENGER) {
    return {
      ok: false,
      grund:
        `Höchstens ${String(MAX_EMPFAENGER)} Empfänger je Nachricht, ` +
        'Kopie und Blindkopie eingerechnet.',
    };
  }

  const betreff = pruefeBetreff(eingabe.betreff);

  if (betreff === null) {
    return { ok: false, grund: 'Der Betreff ist unbrauchbar oder zu lang.' };
  }

  if (eingabe.rumpf.length > MAX_RUMPF) {
    return { ok: false, grund: 'Die Nachricht ist zu lang.' };
  }

  if (eingabe.rumpf.includes('\0')) {
    return { ok: false, grund: 'Die Nachricht enthält unzulässige Zeichen.' };
  }

  const absender = pruefeEmpfaenger(eingabe.absender);

  if (absender === null) {
    return { ok: false, grund: 'Die Absenderadresse ist unbrauchbar.' };
  }

  const kopf = antwortkopf(eltern);

  return {
    ok: true,
    post: {
      an: empfaenger.adressen,
      cc,
      bcc,
      betreff,
      rumpf: eingabe.rumpf,
      kennung: neueKennung(absender, zufall),
      inReplyTo: kopf.inReplyTo,
      references: kopf.references,
    },
  };
};

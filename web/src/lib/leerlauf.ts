const SCHLUESSEL = 'stegwerk.letzteEingabe';

const SCHREIB_ABSTAND_MS = 10_000;

export const WARNUNG_VORHER_MS = 60_000;

export const LEERLAUF_STUFEN: { minuten: number | null; label: string }[] = [
  { minuten: null, label: 'Nie' },
  { minuten: 30, label: 'Nach 30 Minuten' },
  { minuten: 60, label: 'Nach 1 Stunde' },
  { minuten: 240, label: 'Nach 4 Stunden' },
  { minuten: 480, label: 'Nach 8 Stunden' },
];

let zuletztGeschrieben = 0;

export const letzteEingabe = (): number | null => {
  try {
    const roh = window.localStorage.getItem(SCHLUESSEL);
    const wert = roh === null ? Number.NaN : Number(roh);

    return Number.isFinite(wert) ? wert : null;
  } catch {
    return null;
  }
};

export const merkeEingabe = (jetzt = Date.now(), sofort = false): void => {
  if (!sofort && jetzt - zuletztGeschrieben < SCHREIB_ABSTAND_MS) {
    return;
  }

  zuletztGeschrieben = jetzt;

  try {
    window.localStorage.setItem(SCHLUESSEL, String(jetzt));
  } catch {}
};

export const EINGABE_EREIGNISSE = [
  'pointerdown',
  'keydown',
  'wheel',
  'touchstart',
  'mousemove',
] as const;

export const beobachteEingaben = (
  ziel: Pick<Window, 'addEventListener' | 'removeEventListener'>,
): (() => void) => {
  const merken = () => merkeEingabe();

  for (const art of EINGABE_EREIGNISSE) {
    ziel.addEventListener(art, merken, { passive: true });
  }

  return () => {
    for (const art of EINGABE_EREIGNISSE) {
      ziel.removeEventListener(art, merken);
    }
  };
};

export const eingabenZaehlen = (
  fristBekannt: boolean,
  letzte: number | null,
  minuten: number | null,
  jetzt: number,
): boolean =>
  fristBekannt && leerlaufStand(letzte, minuten, jetzt).art !== 'abgelaufen';

export type LeerlaufStand =
  | { art: 'aktiv' }
  | { art: 'warnung'; sekunden: number }
  | { art: 'abgelaufen' };

export const leerlaufStand = (
  letzte: number | null,
  minuten: number | null,
  jetzt: number,
): LeerlaufStand => {
  if (minuten === null || letzte === null) {
    return { art: 'aktiv' };
  }

  const rest = letzte + minuten * 60_000 - jetzt;

  if (rest <= 0) {
    return { art: 'abgelaufen' };
  }

  if (rest <= WARNUNG_VORHER_MS) {
    return { art: 'warnung', sekunden: Math.ceil(rest / 1000) };
  }

  return { art: 'aktiv' };
};

const GRUND = 'stegwerk.abmeldegrund';

export const merkeAbmeldegrund = (grund: string): void => {
  try {
    window.sessionStorage.setItem(GRUND, grund);
  } catch {}
};

export const holeAbmeldegrund = (): string | null => {
  try {
    const grund = window.sessionStorage.getItem(GRUND);

    window.sessionStorage.removeItem(GRUND);

    return grund;
  } catch {
    return null;
  }
};

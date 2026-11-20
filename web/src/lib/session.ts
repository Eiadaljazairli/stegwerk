import { liesCookies, setzeMarke, sitzungGilt } from './angemeldetBleiben';

export type StoredSession = {
  token: string;
  refreshToken?: string;
  user: { id: string; email: string; firstName: string; lastName: string };
  workspace: { id: string; name: string; slug: string };
  angemeldetBleiben?: boolean;
};

const SESSION_KEY = 'stegwerk.session';

export const readSession = (): StoredSession | null => {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);

    if (raw === null) {
      return null;
    }

    const session = JSON.parse(raw) as StoredSession;

    if (!sitzungGilt(session.angemeldetBleiben, liesCookies())) {
      window.localStorage.removeItem(SESSION_KEY);

      return null;
    }

    return session;
  } catch {
    return null;
  }
};

export const readToken = (): string | null => readSession()?.token ?? null;

export const readLegacyRefreshToken = (): string | null =>
  readSession()?.refreshToken ?? null;

export const updateSessionToken = (token: string): void => {
  const session = readSession();

  if (session === null) {
    return;
  }

  const { refreshToken: _alt, ...rest } = session;

  writeSession({ ...rest, token });
};

export const writeSession = (session: StoredSession): void => {
  if (session.angemeldetBleiben === false) {
    setzeMarke();
  }

  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
};

export const clearSession = (): void => {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {}
};

const PENDING_INVITE_KEY = 'stegwerk.pendingInvite';

export const rememberPendingInvite = (token: string): void => {
  try {
    window.sessionStorage.setItem(PENDING_INVITE_KEY, token);
  } catch {}
};

export const readPendingInvite = (): string | null => {
  try {
    return window.sessionStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
};

export const forgetPendingInvite = (): void => {
  try {
    window.sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch {}
};

const PENDING_VERIFICATION_KEY = 'stegwerk.pendingVerification';

export const rememberPendingVerification = (token: string): void => {
  try {
    window.sessionStorage.setItem(PENDING_VERIFICATION_KEY, token);
  } catch {}
};

export const readPendingVerification = (): string | null => {
  try {
    return window.sessionStorage.getItem(PENDING_VERIFICATION_KEY);
  } catch {
    return null;
  }
};

export const forgetPendingVerification = (): void => {
  try {
    window.sessionStorage.removeItem(PENDING_VERIFICATION_KEY);
  } catch {}
};

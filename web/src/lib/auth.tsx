import {
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import { apolloClient } from './apollo';
import { AuthContext, type AuthContextValue } from './auth-kontext';
import { merkeEingabe } from './leerlauf';
import { SIGN_OUT } from './queries';
import {
  clearSession,
  readSession,
  type StoredSession,
  writeSession,
} from './session';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<StoredSession | null>(() =>
    readSession(),
  );

  const startSession = useCallback((next: StoredSession) => {
    merkeEingabe(Date.now(), true);
    writeSession(next);
    setSession(next);
  }, []);

  const endSession = useCallback(() => {
    const alt = readSession()?.refreshToken;

    void apolloClient
      .mutate({
        mutation: SIGN_OUT,
        variables: { input: alt === undefined ? null : { refreshToken: alt } },
      })
      .catch(() => null);

    clearSession();
    setSession(null);
    void apolloClient.clearStore();
  }, []);

  const value = useMemo(
    () => ({
      session,
      isSignedIn: session !== null,
      startSession,
      endSession,
    }),
    [session, startSession, endSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
};

import { createContext, useContext } from 'react';

import { type StoredSession } from './session';

export type AuthContextValue = {
  session: StoredSession | null;
  isSignedIn: boolean;
  startSession: (session: StoredSession) => void;
  endSession: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAngemeldet = (): boolean =>
  useContext(AuthContext)?.isSignedIn ?? false;

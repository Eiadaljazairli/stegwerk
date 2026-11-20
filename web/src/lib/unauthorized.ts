export type Behandlung = 'melden' | 'abmelden' | 'erneuern';

const OHNE_SITZUNG = new Set([
  'SignIn',
  'SignUp',
  'RequestPasswordReset',
  'ResetPassword',
]);

export const behandlung = (operationName: string): Behandlung => {
  if (OHNE_SITZUNG.has(operationName)) {
    return 'melden';
  }

  if (operationName === 'Refresh') {
    return 'abmelden';
  }

  return 'erneuern';
};

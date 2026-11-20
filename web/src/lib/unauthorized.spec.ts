import { describe, expect, it } from 'vitest';

import { behandlung } from './unauthorized';

describe('behandlung', () => {
  it.each(['SignIn', 'SignUp', 'RequestPasswordReset', 'ResetPassword'])(
    '%s scheitert an den Angaben, nicht an der Sitzung',
    (vorgang: string) => {
      expect(behandlung(vorgang)).toBe('melden');
    },
  );

  it('SignIn führt kein Neuladen herbei', () => {
    expect(behandlung('SignIn')).not.toBe('erneuern');
    expect(behandlung('SignIn')).not.toBe('abmelden');
  });

  it('Refresh beendet die Sitzung, statt es noch einmal zu versuchen', () => {
    expect(behandlung('Refresh')).toBe('abmelden');
  });

  it.each(['Companies', 'Deals', 'CreateNote', 'TwoFactorStatus'])(
    '%s bekommt ein erneuertes Token',
    (vorgang: string) => {
      expect(behandlung(vorgang)).toBe('erneuern');
    },
  );

  it('behandelt einen unbekannten Vorgang wie eine abgelaufene Sitzung', () => {
    expect(behandlung('EinNeuerVorgang')).toBe('erneuern');
  });

  it('verwechselt Namen nicht mit Teilzeichenketten', () => {
    expect(behandlung('SignOut')).toBe('erneuern');
    expect(behandlung('RefreshDashboard')).toBe('erneuern');
  });
});

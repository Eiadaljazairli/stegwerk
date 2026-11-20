import { naechsterTermin } from './serien-termine';

describe('naechsterTermin', () => {
  it('geht monatlich weiter', () => {
    expect(naechsterTermin('2026-10-01', 'monthly', 1)).toBe('2026-11-01');
    expect(naechsterTermin('2026-12-15', 'monthly', 15)).toBe('2027-01-15');
  });

  it('kürzt am Monatsende und kehrt danach zum Ankertag zurück', () => {
    expect(naechsterTermin('2027-01-31', 'monthly', 31)).toBe('2027-02-28');
    expect(naechsterTermin('2027-02-28', 'monthly', 31)).toBe('2027-03-31');
    expect(naechsterTermin('2028-01-31', 'monthly', 31)).toBe('2028-02-29');
  });

  it('geht vierteljährlich und jährlich weiter', () => {
    expect(naechsterTermin('2026-11-30', 'quarterly', 30)).toBe('2027-02-28');
    expect(naechsterTermin('2028-02-29', 'yearly', 29)).toBe('2029-02-28');
    expect(naechsterTermin('2029-02-28', 'yearly', 29)).toBe('2030-02-28');
  });
});

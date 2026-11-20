import { describe, expect, it } from 'vitest';

import {
  darfZugriffSehen,
  type FreigabeEintrag,
  freigabeKandidaten,
  freigegebenFuer,
} from './freigaben';

const eintrag = (
  userId: string,
  name: string,
  stufe: FreigabeEintrag['stufe'],
): FreigabeEintrag => ({
  id: `f-${userId}`,
  userId,
  name,
  stufe,
  erteiltVon: null,
  createdAt: '2026-10-28T10:00:00Z',
});

const person = (id: string, firstName: string) => ({
  id,
  firstName,
  lastName: 'Test',
});

describe('freigegebenFuer', () => {
  it('nennt niemanden, wenn nichts freigegeben ist', () => {
    expect(freigegebenFuer([])).toBeNull();
  });

  it('nennt Namen und Stufe, mit „und“ vor dem letzten', () => {
    expect(freigegebenFuer([eintrag('b', 'Ben Test', 'lesen')])).toBe(
      'Ben Test (Lesen)',
    );
    expect(
      freigegebenFuer([
        eintrag('b', 'Ben Test', 'lesen'),
        eintrag('c', 'Clara Test', 'bearbeiten'),
        eintrag('d', 'Dora Test', 'lesen'),
      ]),
    ).toBe('Ben Test (Lesen), Clara Test (Bearbeiten) und Dora Test (Lesen)');
  });
});

describe('freigabeKandidaten', () => {
  const team = [
    person('d', 'Dora'),
    person('a', 'Anna'),
    person('b', 'Ben'),
    person('c', 'Clara'),
  ];

  it('lässt sich selbst, den Verantwortlichen und schon Freigegebene weg', () => {
    expect(
      freigabeKandidaten(
        team,
        {
          freigaben: [eintrag('c', 'Clara Test', 'lesen')],
          verantwortlichId: 'b',
        },
        'a',
      ).map((p) => p.id),
    ).toEqual(['d']);
  });

  it('sortiert nach Namen', () => {
    expect(
      freigabeKandidaten(
        team,
        { freigaben: [], verantwortlichId: null },
        null,
      ).map((p) => p.firstName),
    ).toEqual(['Anna', 'Ben', 'Clara', 'Dora']);
  });
});

describe('darfZugriffSehen', () => {
  it('mit dem Recht, Mitglieder oder Rollen zu verwalten', () => {
    expect(darfZugriffSehen((r) => r === 'workspace:members')).toBe(true);
    expect(darfZugriffSehen((r) => r === 'workspace:roles')).toBe(true);
    expect(darfZugriffSehen((r) => r === 'company:write')).toBe(false);
  });
});

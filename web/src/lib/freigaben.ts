export type FreigabeArt = 'company' | 'contact' | 'deal';

export type FreigabeStufe = 'lesen' | 'bearbeiten';

export type FreigabeEintrag = {
  id: string;
  userId: string;
  name: string;
  stufe: FreigabeStufe;
  erteiltVon: string | null;
  createdAt: string;
};

export type FreigabeStand = {
  freigaben: FreigabeEintrag[];
  darfVerwalten: boolean;
  verantwortlichId: string | null;
};

export type ZugriffZeile = {
  userId: string;
  name: string;
  rolle: string;
  sieht: boolean;
  bearbeitet: boolean;
  grund: string;
};

export const STUFE_LABEL: Record<FreigabeStufe, string> = {
  lesen: 'Lesen',
  bearbeiten: 'Bearbeiten',
};

export const freigegebenFuer = (
  freigaben: FreigabeEintrag[],
): string | null => {
  if (freigaben.length === 0) {
    return null;
  }

  const teile = freigaben.map(
    (freigabe) => `${freigabe.name} (${STUFE_LABEL[freigabe.stufe]})`,
  );

  return teile.length === 1
    ? teile[0]
    : `${teile.slice(0, -1).join(', ')} und ${teile[teile.length - 1]}`;
};

type Person = { id: string; firstName: string; lastName: string };

export const freigabeKandidaten = (
  team: Person[],
  stand: Pick<FreigabeStand, 'freigaben' | 'verantwortlichId'>,
  ichId: string | null,
): Person[] => {
  const schon = new Set(stand.freigaben.map((freigabe) => freigabe.userId));

  return team
    .filter(
      (person) =>
        person.id !== ichId &&
        person.id !== stand.verantwortlichId &&
        !schon.has(person.id),
    )
    .sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(
        `${b.firstName} ${b.lastName}`,
        'de',
      ),
    );
};

export const darfZugriffSehen = (can: (recht: string) => boolean): boolean =>
  can('workspace:members') || can('workspace:roles');

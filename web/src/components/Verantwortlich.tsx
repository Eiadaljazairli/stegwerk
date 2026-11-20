import { gql, useQuery } from '@apollo/client';
import { useState } from 'react';

import { useAuth } from '../lib/auth';

export type Person = { id: string; firstName: string; lastName: string };

export const TEAM_NAMEN = gql`
  query TeamNamen {
    workspaceMembers {
      user {
        id
        firstName
        lastName
      }
    }
  }
`;

export const personName = (person: Person | null | undefined): string =>
  person === null || person === undefined
    ? '—'
    : `${person.firstName} ${person.lastName}`.trim();

export const useTeam = (): Person[] => {
  const { data } = useQuery<{ workspaceMembers: { user: Person }[] }>(
    TEAM_NAMEN,
  );

  return (data?.workspaceMembers ?? [])
    .map((member) => member.user)
    .sort((a, b) => personName(a).localeCompare(personName(b), 'de'));
};

export const useVerantwortlichFilter = (liste: string) => {
  const schluessel = `stegwerk.${liste}.verantwortlich`;
  const { session } = useAuth();
  const [wert, setWertRoh] = useState<string>(() => {
    try {
      return window.localStorage.getItem(schluessel) ?? '';
    } catch {
      return '';
    }
  });

  const setWert = (neu: string) => {
    setWertRoh(neu);

    try {
      window.localStorage.setItem(schluessel, neu);
    } catch {}
  };

  const ownerId =
    wert === '' ? null : wert === 'me' ? (session?.user.id ?? null) : wert;

  return { wert, setWert, ownerId };
};

export const VerantwortlichFilter = ({
  wert,
  onChange,
}: {
  wert: string;
  onChange: (neu: string) => void;
}) => {
  const team = useTeam();

  return (
    <select
      className="toolbar__filter"
      aria-label="Nach Verantwortlichem filtern"
      value={wert}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Alle Verantwortlichen</option>
      <option value="me">Meine</option>
      {team.map((person) => (
        <option key={person.id} value={person.id}>
          {personName(person)}
        </option>
      ))}
    </select>
  );
};

export const VerantwortlichAuswahl = ({
  id,
  owner,
  disabled,
  onSave,
}: {
  id: string;
  owner: Person | null | undefined;
  disabled?: boolean;
  onSave: (ownerId: string | null) => void;
}) => {
  const team = useTeam();
  const aktuell = owner?.id ?? '';
  const dabei = aktuell === '' || team.some((p) => p.id === aktuell);

  return (
    <select
      id={id}
      value={aktuell}
      disabled={disabled}
      onChange={(event) =>
        onSave(event.target.value === '' ? null : event.target.value)
      }
    >
      <option value="">— niemand —</option>
      {!dabei && owner !== null && owner !== undefined && (
        <option value={owner.id}>{personName(owner)}</option>
      )}
      {team.map((person) => (
        <option key={person.id} value={person.id}>
          {personName(person)}
        </option>
      ))}
    </select>
  );
};

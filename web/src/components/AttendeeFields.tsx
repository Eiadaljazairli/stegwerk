import { useState } from 'react';

import {
  ATTENDEE_STATUS_LABELS,
  ATTENDEE_STATUSES,
  type AttendeeStatusId,
  type Membership,
} from '../lib/types';

export type AttendeeDraft = {
  contactId?: string | null;
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  status?: AttendeeStatusId;
};

const labelFor = (
  draft: AttendeeDraft,
  contacts: { id: string; firstName: string; lastName: string }[],
  team: Membership[],
): string => {
  if (draft.contactId !== null && draft.contactId !== undefined) {
    const kontakt = contacts.find((eintrag) => eintrag.id === draft.contactId);

    return kontakt === undefined
      ? (draft.name ?? 'Kontakt')
      : `${kontakt.firstName} ${kontakt.lastName}`;
  }

  if (draft.userId !== null && draft.userId !== undefined) {
    const mitglied = team.find((eintrag) => eintrag.user.id === draft.userId);

    return mitglied === undefined
      ? (draft.name ?? 'Teammitglied')
      : `${mitglied.user.firstName} ${mitglied.user.lastName}`;
  }

  const name = draft.name?.trim() ?? '';

  return name === ''
    ? (draft.email ?? 'Unbekannt')
    : `${name} (${draft.email ?? ''})`;
};

export const AttendeeFields = ({
  value,
  contacts,
  team,
  onChange,
}: {
  value: AttendeeDraft[];
  contacts: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  }[];
  team: Membership[];
  onChange: (next: AttendeeDraft[]) => void;
}): JSX.Element => {
  const [gastAdresse, setGastAdresse] = useState('');
  const [gastName, setGastName] = useState('');

  const schonDabei = (kandidat: AttendeeDraft): boolean =>
    value.some(
      (dabei) =>
        (kandidat.contactId !== undefined &&
          dabei.contactId === kandidat.contactId) ||
        (kandidat.userId !== undefined && dabei.userId === kandidat.userId) ||
        (kandidat.email !== undefined &&
          (dabei.email ?? '').toLowerCase() ===
            (kandidat.email ?? '').toLowerCase() &&
          kandidat.email !== ''),
    );

  const hinzu = (eintrag: AttendeeDraft): void => {
    if (schonDabei(eintrag)) {
      return;
    }

    onChange([...value, { status: 'NEEDS_ACTION', ...eintrag }]);
  };

  return (
    <div className="field field--wide">
      <label>Teilnehmer</label>

      {value.length === 0 ? (
        <p className="field__hint">Noch niemand eingetragen.</p>
      ) : (
        <ul className="attendees">
          {value.map((dabei, index) => (
            <li
              key={`${dabei.contactId ?? dabei.userId ?? dabei.email ?? ''}-${String(index)}`}
              className="attendees__row"
            >
              <span className="attendees__name">
                {labelFor(dabei, contacts, team)}
              </span>

              <select
                aria-label="Rückmeldung"
                value={dabei.status ?? 'NEEDS_ACTION'}
                onChange={(event) =>
                  onChange(
                    value.map((eintrag, andere) =>
                      andere === index
                        ? {
                            ...eintrag,
                            status: event.target.value as AttendeeStatusId,
                          }
                        : eintrag,
                    ),
                  )
                }
              >
                {ATTENDEE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {ATTENDEE_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="button button--ghost row-action"
                aria-label={`${labelFor(dabei, contacts, team)} entfernen`}
                onClick={() =>
                  onChange(value.filter((_, andere) => andere !== index))
                }
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="attendees__add">
        <select
          aria-label="Ansprechpartner hinzufügen"
          value=""
          onChange={(event) => {
            if (event.target.value !== '') {
              hinzu({ contactId: event.target.value });
            }
          }}
        >
          <option value="">Ansprechpartner…</option>
          {contacts.map((kontakt) => (
            <option key={kontakt.id} value={kontakt.id}>
              {kontakt.firstName} {kontakt.lastName}
            </option>
          ))}
        </select>

        <select
          aria-label="Aus dem Team hinzufügen"
          value=""
          onChange={(event) => {
            if (event.target.value !== '') {
              hinzu({ userId: event.target.value });
            }
          }}
        >
          <option value="">Aus dem Team…</option>
          {team.map((mitglied) => (
            <option key={mitglied.user.id} value={mitglied.user.id}>
              {mitglied.user.firstName} {mitglied.user.lastName}
            </option>
          ))}
        </select>
      </div>

      <div className="attendees__add">
        <input
          aria-label="E-Mail-Adresse"
          type="email"
          placeholder="jemand@example.de"
          value={gastAdresse}
          onChange={(event) => setGastAdresse(event.target.value)}
        />
        <input
          aria-label="Name"
          placeholder="Name (freiwillig)"
          value={gastName}
          onChange={(event) => setGastName(event.target.value)}
        />
        <button
          type="button"
          className="button button--ghost"
          disabled={gastAdresse.trim() === ''}
          onClick={() => {
            hinzu({
              email: gastAdresse.trim(),
              name: gastName.trim() === '' ? null : gastName.trim(),
            });
            setGastAdresse('');
            setGastName('');
          }}
        >
          Hinzufügen
        </button>
      </div>

      <p className="field__hint">
        Rückmeldungen trägt jemand von Hand ein, nachdem er gefragt hat. Dieses
        Programm verschickt keine Einladungen mit Zusagen-Knopf; die Datei zum
        Termin lässt sich aber verschicken.
      </p>
    </div>
  );
};

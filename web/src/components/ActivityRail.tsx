import { useState } from 'react';

import { ActivityFeed } from './ActivityFeed';
import { Herkunft } from './Herkunft';
import { AppointmentList } from './AppointmentList';
import { IconCalendar, IconNote, IconTasks } from './Icons';
import { NotesTimeline } from './NotesTimeline';
import { ohneDoppelteTermine } from '../lib/termine-zusammen';
import { ObjectTile } from './ObjectTile';
import { TaskList } from './TaskList';
import { type Note, type RailAppointment, type Task } from '../lib/types';
import { type ZielVorschlag } from '../lib/verknuepfungen';

export type AusKontakten = {
  notes: (Note & { contactId: string | null })[];
  tasks: Task[];
  appointments: (RailAppointment & { contactId: string | null })[];
  namen: Record<string, string>;
};

const MERKEN = 'stegwerk.akte.mitKontakten';

const gemerkt = (): boolean => {
  try {
    return window.localStorage.getItem(MERKEN) !== 'nein';
  } catch {
    return true;
  }
};

const merken = (an: boolean) => {
  try {
    window.localStorage.setItem(MERKEN, an ? 'ja' : 'nein');
  } catch {}
};

const terminOrdnung = (termine: RailAppointment[]): RailAppointment[] => {
  const heute = new Date().toISOString().slice(0, 10);
  const schluessel = (termin: RailAppointment) =>
    `${termin.startDate}T${termin.startTime}`;
  const kommend = termine
    .filter((termin) => termin.endDate >= heute)
    .sort((a, b) => schluessel(a).localeCompare(schluessel(b)));
  const vergangen = termine
    .filter((termin) => termin.endDate < heute)
    .sort((a, b) => schluessel(b).localeCompare(schluessel(a)));

  return [...kommend, ...vergangen];
};

export const ActivityRail = ({
  recordId,
  target,
  appointments,
  tasks,
  notes,
  onChanged,
  ausKontakten,
  beteiligtenTermine,
  notizVorschlaege,
}: {
  recordId: string;
  target: { companyId?: string; contactId?: string; dealId?: string };
  appointments: RailAppointment[];
  tasks: Task[];
  notes: Note[];
  onChanged: () => void;
  ausKontakten?: AusKontakten;
  beteiligtenTermine?: RailAppointment[];
  notizVorschlaege?: ZielVorschlag[];
}) => {
  const [mitKontakten, setMitKontakten] = useState(gemerkt);
  const zeigen = ausKontakten !== undefined && mitKontakten;
  const name = (contactId: string | null) =>
    contactId === null ? null : (ausKontakten?.namen[contactId] ?? 'Kontakt');

  const kontaktTermine = zeigen ? ausKontakten.appointments : [];
  const herkunftJeTermin = new Map<string, string | null>([
    ...(beteiligtenTermine ?? []).map(
      (termin) => [termin.id, 'Beteiligten'] as const,
    ),
    ...kontaktTermine.map(
      (termin) => [termin.id, name(termin.contactId)] as const,
    ),
  ]);
  const alleTermine =
    zeigen || (beteiligtenTermine ?? []).length > 0
      ? terminOrdnung(
          ohneDoppelteTermine(
            appointments,
            kontaktTermine,
            beteiligtenTermine ?? [],
          ),
        )
      : appointments;
  for (const termin of appointments) {
    herkunftJeTermin.delete(termin.id);
  }
  const kontaktAufgaben = zeigen ? ausKontakten.tasks : [];
  const alleNotizen = zeigen
    ? [
        ...notes,
        ...ausKontakten.notes.map((notiz) => ({
          ...notiz,
          herkunft: name(notiz.contactId) ?? 'Kontakt',
        })),
      ]
    : notes;

  return (
    <aside className="rail" aria-label="Aktivität">
      {ausKontakten !== undefined && (
        <div className="rail__schalter">
          <button
            type="button"
            className="zeit-chip"
            aria-pressed={mitKontakten}
            onClick={() => {
              setMitKontakten(!mitKontakten);
              merken(!mitKontakten);
            }}
          >
            Auch von Kontakten der Firma
          </button>
        </div>
      )}

      <section className="related">
        <header className="related__head">
          <ObjectTile kind="task" icon={IconCalendar} size="md" />
          <h2 className="related__title">
            Termine
            <span className="related__count">{alleTermine.length}</span>
          </h2>
        </header>

        <div className="related__body rail__body">
          <AppointmentList
            appointments={alleTermine}
            emptyMessage="Kein Termin zu diesem Eintrag."
            herkunft={(termin) => herkunftJeTermin.get(termin.id) ?? null}
          />
        </div>
      </section>

      <section className="related">
        <header className="related__head">
          <ObjectTile kind="task" icon={IconTasks} size="md" />
          <h2 className="related__title">
            Aufgaben
            <span className="related__count">
              {tasks.length + kontaktAufgaben.length}
            </span>
          </h2>
        </header>

        <div className="related__body rail__body">
          <TaskList
            tasks={tasks}
            target={target}
            onChanged={onChanged}
            showLinkedRecord={false}
            emptyMessage="Nichts offen zu diesem Eintrag."
          />
          {kontaktAufgaben.length > 0 && (
            <>
              <h3 className="rail__unter">Bei Kontakten der Firma</h3>
              <TaskList tasks={kontaktAufgaben} onChanged={onChanged} />
            </>
          )}
        </div>
      </section>

      <section className="related">
        <header className="related__head">
          <ObjectTile kind="overview" icon={IconNote} size="md" />
          <h2 className="related__title">Aktivität</h2>
        </header>

        <div className="related__body rail__body rail__notes">
          <NotesTimeline
            notes={[]}
            target={target}
            onChanged={onChanged}
            formOnly
            vorschlaege={notizVorschlaege}
          />
          <ActivityFeed
            recordId={recordId}
            target={target}
            notes={alleNotizen}
            onChanged={onChanged}
          />
          <Herkunft recordId={recordId} target={target} />
        </div>
      </section>
    </aside>
  );
};

import { useMutation, useQuery } from '@apollo/client';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { AppointmentEditor } from '../components/AppointmentEditor';
import { WeekView } from '../components/WeekView';
import { EmptyState } from '../components/EmptyState';
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconRepeat,
} from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { LoadingAnnouncement } from '../components/Skeleton';
import {
  dayLabel,
  daysOf,
  isSameMonth,
  isWeekend,
  monthGrid,
  monthLabel,
  shiftDay,
  shiftMonth,
  startOfMonth,
  todayInBerlin,
  WEEKDAYS,
} from '../lib/calendar-grid';
import { CalendarFeedButton } from '../components/CalendarFeedButton';
import { KalenderVerbindenButton } from '../components/KalenderVerbindenButton';
import { downloadCalendarIcs } from '../lib/download';
import { type Span } from '../lib/drag-move';
import { ScopeDialog } from '../components/ScopeDialog';
import { weekDays, weekLabel } from '../lib/week-grid';
import {
  APPOINTMENTS,
  TASKS,
  UPDATE_APPOINTMENT,
  WORKSPACE_MEMBERS,
} from '../lib/queries';
import {
  type Appointment,
  formatDuration,
  type Membership,
  type Task,
} from '../lib/types';
import { useAuth } from '../lib/auth';
import { VideoLink } from '../components/VideoLink';

type Ansicht = 'MONTH' | 'WEEK' | 'DAY';

const ANSICHT_LABELS: Record<Ansicht, string> = {
  MONTH: 'Monat',
  WEEK: 'Woche',
  DAY: 'Tag',
};

const chipTime = (appointment: Appointment): string =>
  appointment.allDay ? 'ganztägig' : appointment.startTime;

const TeilnehmerStand = ({ termin }: { termin: Appointment }) =>
  termin.eingeladenAm === null || termin.attendees.length === 0 ? null : (
    <ul className="attendee-stand" aria-label="Antworten auf die Einladung">
      {termin.attendees.map((dabei) => (
        <li key={dabei.id} className={`attendee-stand__${dabei.status}`}>
          {dabei.name}: {dabei.statusLabel}
        </li>
      ))}
    </ul>
  );

export const CalendarPage = () => {
  const heute = todayInBerlin();

  const [month, setMonth] = useState(() => startOfMonth(heute));
  const [selected, setSelected] = useState(heute);
  const [ownerId, setOwnerId] = useState('');
  const [zeigeAbgesagte, setZeigeAbgesagte] = useState(false);

  const [ansicht, setAnsicht] = useState<Ansicht>(() => {
    try {
      const gemerkt = localStorage.getItem('stegwerk.kalender.ansicht');

      return gemerkt === 'WEEK' || gemerkt === 'DAY' ? gemerkt : 'MONTH';
    } catch {
      return 'MONTH';
    }
  });

  const ansichtWechseln = (naechste: Ansicht): void => {
    setAnsicht(naechste);

    try {
      localStorage.setItem('stegwerk.kalender.ansicht', naechste);
    } catch {}
  };
  const [editing, setEditing] = useState<Appointment | 'neu' | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const [neueZeit, setNeueZeit] = useState<{
    date: string;
    time: string;
  } | null>(null);

  const [gezogen, setGezogen] = useState<{
    termin: Appointment;
    span: Span;
  } | null>(null);

  const grid = useMemo(() => {
    if (ansicht === 'DAY') {
      return [selected];
    }

    return ansicht === 'WEEK' ? weekDays(selected) : monthGrid(month);
  }, [ansicht, month, selected]);

  const { data, loading, error, refetch } = useQuery<{
    appointments: Appointment[];
  }>(APPOINTMENTS, {
    variables: {
      from: grid[0],
      to: grid[grid.length - 1],
      ownerId: ownerId === '' ? null : ownerId,
      includeCancelled: zeigeAbgesagte,
    },
  });

  const { data: team } = useQuery<{ workspaceMembers: Membership[] }>(
    WORKSPACE_MEMBERS,
  );

  const { session } = useAuth();
  const { data: aufgabenDaten } = useQuery<{ tasks: { items: Task[] } }>(
    TASKS,
    {
      variables: {
        assigneeId: session?.user.id ?? null,
        completed: false,
        limit: 200,
        sortField: 'dueDate',
      },
      skip: session === null,
    },
  );

  const aufgabenNachTag = useMemo(() => {
    const map = new Map<string, Task[]>();

    for (const aufgabe of aufgabenDaten?.tasks.items ?? []) {
      if (aufgabe.dueDate === null) {
        continue;
      }

      map.set(aufgabe.dueDate, [...(map.get(aufgabe.dueDate) ?? []), aufgabe]);
    }

    for (const liste of map.values()) {
      liste.sort((a, b) =>
        (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99'),
      );
    }

    return map;
  }, [aufgabenDaten]);

  const aufgabenDesTages = aufgabenNachTag.get(selected) ?? [];

  const [updateAppointment] = useMutation(UPDATE_APPOINTMENT);

  const termine = data?.appointments ?? [];

  const nachTag = useMemo(() => {
    const map = new Map<string, Appointment[]>();

    for (const termin of termine) {
      for (const tag of daysOf(termin)) {
        const bisher = map.get(tag);

        if (bisher === undefined) {
          map.set(tag, [termin]);
        } else {
          bisher.push(termin);
        }
      }
    }

    return map;
  }, [termine]);

  const desTages = nachTag.get(selected) ?? [];

  const oeffnen = (termin: Appointment): void => {
    if (termin.geschwaerzt === true) {
      setFehler(
        `${termin.ownerName} hat hier einen privaten Termin. Mehr als „belegt“ ist nicht zu sehen.`,
      );

      return;
    }

    setEditing(termin);
  };

  const verschieben = (termin: Appointment, span: Span): void => {
    if (termin.geschwaerzt === true) {
      return;
    }

    if (termin.recurrence !== null && termin.occurrenceOn !== null) {
      setGezogen({ termin, span });
      return;
    }

    void speichereVerschiebung(termin, span, 'SERIES');
  };

  const speichereVerschiebung = async (
    termin: Appointment,
    span: Span,
    scope: 'ONE' | 'FOLLOWING' | 'SERIES',
  ): Promise<void> => {
    setFehler(null);

    try {
      await updateAppointment({
        variables: {
          input: {
            id: termin.id,
            scope,
            startDate: span.startDate,
            startTime: span.startTime,
            endDate: span.endDate,
            endTime: span.endTime,
          },
        },
      });

      await refetch();
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
      );
      await refetch();
    }
  };

  const springen = (schritte: number): void => {
    if (ansicht === 'WEEK' || ansicht === 'DAY') {
      const weite = schritte * (ansicht === 'WEEK' ? 7 : 1);

      setSelected((vorher) => {
        const nächster = shiftDay(vorher, weite);

        setMonth(startOfMonth(nächster));

        return nächster;
      });
      return;
    }

    setMonth((vorher) => {
      const nächster = shiftMonth(vorher, schritte);

      setSelected(
        isSameMonth(heute, nächster) ? heute : `${nächster.slice(0, 7)}-01`,
      );

      return nächster;
    });
  };

  return (
    <>
      {gezogen !== null && (
        <ScopeDialog
          title="Welche Termine verschieben?"
          consequence={`„${gezogen.termin.title}“ wiederholt sich: ${
            gezogen.termin.recurrenceText ?? 'als Serie'
          }. „Nur dieser Termin“ verschiebt nur den gezogenen Tag; „Dieser und alle folgenden“ verschiebt ihn und alle danach; „Alle Termine“ verschiebt jeden Tag der Serie um dasselbe Stück.`}
          onOne={() => {
            const zug = gezogen;

            setGezogen(null);
            void speichereVerschiebung(zug.termin, zug.span, 'ONE');
          }}
          onFollowing={() => {
            const zug = gezogen;

            setGezogen(null);
            void speichereVerschiebung(zug.termin, zug.span, 'FOLLOWING');
          }}
          onSeries={() => {
            const zug = gezogen;

            setGezogen(null);
            void speichereVerschiebung(zug.termin, zug.span, 'SERIES');
          }}
          onCancel={() => {
            setGezogen(null);
            void refetch();
          }}
        />
      )}

      {editing !== null && (
        <AppointmentEditor
          appointment={editing === 'neu' ? null : editing}
          defaultDate={neueZeit?.date ?? selected}
          defaultTime={neueZeit?.time}
          onClose={() => {
            setEditing(null);
            setNeueZeit(null);
          }}
          onSaved={() => {
            setEditing(null);
            setNeueZeit(null);
            void refetch();
          }}
        />
      )}

      <ObjectHeader
        hilfe="kalender"
        kind="task"
        icon={IconCalendar}
        label="Kalender"
        title={
          ansicht === 'DAY'
            ? dayLabel(selected)
            : ansicht === 'WEEK'
              ? weekLabel(selected)
              : monthLabel(month)
        }
        actions={
          <>
            <select
              aria-label="Kalender von"
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
            >
              <option value="">Alle im Team</option>
              {(team?.workspaceMembers ?? []).map((mitglied) => (
                <option key={mitglied.user.id} value={mitglied.user.id}>
                  {mitglied.user.firstName} {mitglied.user.lastName}
                </option>
              ))}
            </select>
            <div className="viewswitch" role="group" aria-label="Ansicht">
              {(['MONTH', 'WEEK', 'DAY'] as const).map((wahl) => (
                <button
                  key={wahl}
                  type="button"
                  className={
                    ansicht === wahl
                      ? 'viewswitch__option viewswitch__option--on'
                      : 'viewswitch__option'
                  }
                  aria-pressed={ansicht === wahl}
                  onClick={() => ansichtWechseln(wahl)}
                >
                  {ANSICHT_LABELS[wahl]}
                </button>
              ))}
            </div>

            <label className="toolbar__toggle">
              <input
                type="checkbox"
                checked={zeigeAbgesagte}
                onChange={(event) => setZeigeAbgesagte(event.target.checked)}
              />{' '}
              Abgesagte
            </label>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => springen(-1)}
              aria-label="Vorheriger Monat"
            >
              <IconChevronLeft />
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                setMonth(startOfMonth(heute));
                setSelected(heute);
              }}
            >
              Heute
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => springen(1)}
              aria-label="Nächster Monat"
            >
              <IconChevronRight />
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                setFehler(null);
                void downloadCalendarIcs(
                  grid[0],
                  grid[grid.length - 1],
                  ownerId,
                ).catch((problem: unknown) => {
                  setFehler(
                    problem instanceof Error
                      ? problem.message
                      : 'Unbekannter Fehler.',
                  );
                });
              }}
            >
              Als Datei
            </button>
            <CalendarFeedButton />
            <KalenderVerbindenButton />
            <button
              type="button"
              className="button"
              onClick={() => {
                setNeueZeit(null);
                setEditing('neu');
              }}
            >
              Neuer Termin
            </button>
          </>
        }
      />

      {(error !== undefined || fehler !== null) && (
        <div className="error-banner" role="alert">
          {fehler ?? error?.message}
        </div>
      )}

      {loading && data === undefined && <LoadingAnnouncement />}

      {ansicht === 'DAY' ? (
        <div className="day">
          <div className="day__grid">
            <WeekView
              days={grid}
              appointments={termine}
              onOpen={oeffnen}
              onMove={verschieben}
              onPick={(tag, zeit) => {
                setSelected(tag);
                setNeueZeit({ date: tag, time: zeit });
                setEditing('neu');
              }}
            />
          </div>

          <section className="card day__list">
            <h2>{dayLabel(selected)}</h2>
            {desTages.length === 0 ? (
              <EmptyState
                title="Nichts eingetragen"
                description="An diesem Tag steht nichts im Kalender."
              />
            ) : (
              <ul className="daylist">
                {desTages.map((termin) => (
                  <li
                    key={termin.id}
                    className={
                      termin.cancelledAt === null
                        ? 'daylist__item'
                        : 'daylist__item daylist__item--cancelled'
                    }
                  >
                    <div className="daylist__when">
                      {termin.allDay ? (
                        'ganztägig'
                      ) : (
                        <>
                          {termin.startTime}
                          <span className="daylist__dash"> bis </span>
                          {termin.endTime}
                        </>
                      )}
                      <div className="field__hint">
                        {termin.allDay ? '' : formatDuration(termin.minutes)}
                      </div>
                    </div>

                    <div className="daylist__what">
                      <button
                        type="button"
                        className="daylist__title"
                        onClick={() => oeffnen(termin)}
                      >
                        {termin.title}
                      </button>
                      {termin.geschwaerzt === true && (
                        <span className="quelle-badge quelle-badge--privat">
                          privat
                        </span>
                      )}
                      {termin.quelle === 'kalender' && (
                        <span className="quelle-badge">aus Kalender</span>
                      )}

                      <div className="field__hint">
                        {termin.ownerName}
                        {termin.location === null
                          ? ''
                          : ` · ${termin.location}`}
                        {termin.attendees.length === 0
                          ? ''
                          : ` · ${termin.attendeeSummary}`}
                        {termin.cancelledAt === null ? '' : ' · abgesagt'}
                      </div>
                      <TeilnehmerStand termin={termin} />
                      <VideoLink href={termin.videoLink} />

                      {termin.recurrenceText !== null && (
                        <div className="series-note">
                          <IconRepeat size={13} /> {termin.recurrenceText}
                        </div>
                      )}
                      {termin.serieId !== null &&
                        termin.serieId !== undefined && (
                          <div className="series-note">
                            <IconRepeat size={13} /> Einzeln geänderter Tag
                            einer Serie
                          </div>
                        )}

                      {termin.company !== null && (
                        <Link
                          className="daylist__link"
                          to={`/firmen/${termin.company.id}`}
                        >
                          {termin.company.name}
                        </Link>
                      )}

                      {termin.description !== null && (
                        <p className="daylist__note">{termin.description}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : ansicht === 'WEEK' ? (
        <WeekView
          days={grid}
          appointments={termine}
          onOpen={oeffnen}
          onMove={verschieben}
          onPick={(tag, zeit) => {
            setSelected(tag);
            setNeueZeit({ date: tag, time: zeit });
            setEditing('neu');
          }}
        />
      ) : (
        <div className="calendar">
          <div className="calendar__weekdays">
            {WEEKDAYS.map((tag) => (
              <div key={tag} className="calendar__weekday">
                {tag}
              </div>
            ))}
          </div>

          <div className="calendar__grid">
            {grid.map((tag) => {
              const desKästchens = nachTag.get(tag) ?? [];
              const klassen = [
                'calendar__day',
                isSameMonth(tag, month) ? '' : 'calendar__day--other',
                isWeekend(tag) ? 'calendar__day--weekend' : '',
                tag === heute ? 'calendar__day--today' : '',
                tag === selected ? 'calendar__day--selected' : '',
              ]
                .filter((klasse) => klasse !== '')
                .join(' ');

              return (
                <button
                  type="button"
                  key={tag}
                  className={klassen}
                  onClick={() => setSelected(tag)}
                  aria-current={tag === heute ? 'date' : undefined}
                  aria-label={`${dayLabel(tag)}, ${
                    desKästchens.length === 1
                      ? 'ein Termin'
                      : `${String(desKästchens.length)} Termine`
                  }`}
                >
                  <span className="calendar__number">
                    {Number(tag.slice(8))}
                  </span>

                  {desKästchens.slice(0, 3).map((termin) => (
                    <span
                      key={termin.id}
                      className={
                        termin.cancelledAt === null
                          ? 'calendar__chip'
                          : 'calendar__chip calendar__chip--cancelled'
                      }
                    >
                      <span className="calendar__chip-time">
                        {chipTime(termin)}
                      </span>{' '}
                      {termin.title}
                    </span>
                  ))}

                  {desKästchens.length > 3 && (
                    <span className="calendar__more">
                      +{desKästchens.length - 3} weitere
                    </span>
                  )}

                  {(aufgabenNachTag.get(tag)?.length ?? 0) > 0 && (
                    <span className="calendar__aufgaben">
                      {aufgabenNachTag.get(tag)?.length === 1
                        ? '1 Aufgabe'
                        : `${String(aufgabenNachTag.get(tag)?.length ?? 0)} Aufgaben`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {ansicht === 'MONTH' && (
        <section className="card">
          <h2>{dayLabel(selected)}</h2>

          {aufgabenDesTages.length > 0 && (
            <ul
              className="daylist daylist--aufgaben"
              aria-label="Fällige Aufgaben"
            >
              {aufgabenDesTages.map((aufgabe) => (
                <li key={aufgabe.id} className="daylist__item">
                  <div className="daylist__when">
                    {aufgabe.dueTime ?? 'ganztags'}
                    <div className="field__hint">Aufgabe</div>
                  </div>
                  <div className="daylist__what">
                    <Link className="daylist__title" to="/aufgaben">
                      {aufgabe.title}
                    </Link>
                    <div className="field__hint">
                      {aufgabe.status === 'in_arbeit' ? 'In Arbeit' : 'Offen'}
                      {aufgabe.isOverdue ? ' · überfällig' : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {desTages.length === 0 ? (
            aufgabenDesTages.length > 0 ? null : (
              <EmptyState
                title="Nichts eingetragen"
                description="An diesem Tag steht nichts im Kalender."
              />
            )
          ) : (
            <ul className="daylist">
              {desTages.map((termin) => (
                <li
                  key={termin.id}
                  className={
                    termin.cancelledAt === null
                      ? 'daylist__item'
                      : 'daylist__item daylist__item--cancelled'
                  }
                >
                  <div className="daylist__when">
                    {termin.allDay ? (
                      'ganztägig'
                    ) : (
                      <>
                        {termin.startTime}
                        <span className="daylist__dash"> bis </span>
                        {termin.endTime}
                      </>
                    )}
                    <div className="field__hint">
                      {termin.allDay ? '' : formatDuration(termin.minutes)}
                    </div>
                  </div>

                  <div className="daylist__what">
                    <button
                      type="button"
                      className="daylist__title"
                      onClick={() => oeffnen(termin)}
                    >
                      {termin.title}
                    </button>
                    {termin.geschwaerzt === true && (
                      <span className="quelle-badge quelle-badge--privat">
                        privat
                      </span>
                    )}
                    {termin.quelle === 'kalender' && (
                      <span className="quelle-badge">aus Kalender</span>
                    )}

                    <div className="field__hint">
                      {termin.ownerName}
                      {termin.location === null ? '' : ` · ${termin.location}`}
                      {termin.attendees.length === 0
                        ? ''
                        : ` · ${termin.attendeeSummary}`}
                      {termin.cancelledAt === null ? '' : ' · abgesagt'}
                    </div>
                    <TeilnehmerStand termin={termin} />
                    <VideoLink href={termin.videoLink} />

                    {termin.recurrenceText !== null && (
                      <div className="series-note">
                        <IconRepeat size={13} /> {termin.recurrenceText}
                      </div>
                    )}
                    {termin.serieId !== null &&
                      termin.serieId !== undefined && (
                        <div className="series-note">
                          <IconRepeat size={13} /> Einzeln geänderter Tag einer
                          Serie
                        </div>
                      )}

                    {termin.company !== null && (
                      <Link
                        className="daylist__link"
                        to={`/firmen/${termin.company.id}`}
                      >
                        {termin.company.name}
                      </Link>
                    )}
                    {termin.contact !== null && (
                      <Link
                        className="daylist__link"
                        to={`/kontakte/${termin.contact.id}`}
                      >
                        {termin.contact.firstName} {termin.contact.lastName}
                      </Link>
                    )}
                    {termin.deal !== null && (
                      <Link
                        className="daylist__link"
                        to={`/geschaefte/${termin.deal.id}`}
                      >
                        {termin.deal.name}
                      </Link>
                    )}

                    {termin.description !== null && (
                      <p className="daylist__note">{termin.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
};

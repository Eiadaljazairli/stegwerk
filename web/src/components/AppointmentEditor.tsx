import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { downloadAppointmentIcs } from '../lib/download';
import {
  EMPTY_RECURRENCE,
  fromRule,
  type RecurrenceForm,
  toRule,
} from '../lib/recurrence-form';
import { type AttendeeDraft, AttendeeFields } from './AttendeeFields';
import { ConfirmDialog } from './ConfirmDialog';
import { RecurrenceFields } from './RecurrenceFields';
import { ScopeDialog } from './ScopeDialog';
import { useToast } from './Toast';
import {
  APPOINTMENT_CONFLICTS,
  CANCEL_APPOINTMENT,
  COMPANY_OPTIONS,
  CONTACT_OPTIONS,
  CREATE_APPOINTMENT,
  DELETE_APPOINTMENT,
  REINSTATE_APPOINTMENT,
  TERMIN_EINLADUNG_SENDEN,
  UPDATE_APPOINTMENT,
  WORKSPACE_MEMBERS,
} from '../lib/queries';
import {
  type Appointment,
  type AppointmentConflict,
  formatDuration,
  type Membership,
  REMINDER_CHOICES,
} from '../lib/types';

type Props = {
  appointment: Appointment | null;
  defaultDate: string;
  defaultTime?: string;
  onClose: () => void;
  onSaved: () => void;
};

const plusHour = (time: string): string => {
  const [hour, minute] = time.split(':').map((part) => Number(part));

  return `${String((hour + 1) % 24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

type Umfang = 'ONE' | 'FOLLOWING' | 'SERIES';

export const AppointmentEditor = ({
  appointment,
  defaultDate,
  defaultTime,
  onClose,
  onSaved,
}: Props): JSX.Element => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const client = useApolloClient();

  const { data: team } = useQuery<{ workspaceMembers: Membership[] }>(
    WORKSPACE_MEMBERS,
  );

  const { data: firmen } = useQuery<{
    companies: { items: { id: string; name: string }[] };
  }>(COMPANY_OPTIONS);

  const { data: kontakte } = useQuery<{
    contacts: {
      items: {
        id: string;
        firstName: string;
        lastName: string;
        email: string | null;
      }[];
    };
  }>(CONTACT_OPTIONS);

  const [createAppointment, { loading: creating }] =
    useMutation(CREATE_APPOINTMENT);
  const [updateAppointment, { loading: updating }] =
    useMutation(UPDATE_APPOINTMENT);
  const [cancelAppointment] = useMutation(CANCEL_APPOINTMENT);
  const [reinstateAppointment] = useMutation(REINSTATE_APPOINTMENT);
  const [deleteAppointment] = useMutation(DELETE_APPOINTMENT);
  const [einladungSenden] = useMutation(TERMIN_EINLADUNG_SENDEN);
  const { zeige } = useToast();
  const [einladen, setEinladen] = useState(false);

  const [title, setTitle] = useState(appointment?.title ?? '');
  const [description, setDescription] = useState(
    appointment?.description ?? '',
  );
  const [location, setLocation] = useState(appointment?.location ?? '');
  const [videoLink, setVideoLink] = useState(appointment?.videoLink ?? '');
  const [privat, setPrivat] = useState(appointment?.privat ?? false);
  const [startDate, setStartDate] = useState(
    appointment?.startDate ?? defaultDate,
  );
  const [startTime, setStartTime] = useState(
    appointment?.startTime ?? defaultTime ?? '09:00',
  );
  const [endDate, setEndDate] = useState(appointment?.endDate ?? defaultDate);
  const [endTime, setEndTime] = useState(
    appointment?.endTime ??
      (defaultTime === undefined ? '10:00' : plusHour(defaultTime)),
  );
  const [allDay, setAllDay] = useState(appointment?.allDay ?? false);
  const [ownerId, setOwnerId] = useState(appointment?.ownerId ?? '');
  const [remind, setRemind] = useState<number | null>(
    appointment?.remindMinutesBefore ?? null,
  );
  const [companyId, setCompanyId] = useState(appointment?.company?.id ?? '');

  const [wiederholung, setWiederholung] = useState<RecurrenceForm>(() =>
    appointment === null
      ? { ...EMPTY_RECURRENCE }
      : fromRule(appointment.recurrence),
  );

  const [runde, setRunde] = useState<AttendeeDraft[]>(() =>
    (appointment?.attendees ?? []).map((dabei) => ({
      contactId: dabei.contactId,
      userId: dabei.userId,
      email: dabei.email,
      name: dabei.name,
      status: dabei.status,
    })),
  );

  const istSerientermin =
    appointment !== null &&
    appointment.recurrence !== null &&
    appointment.occurrenceOn !== null;

  const istAusnahme =
    appointment !== null &&
    appointment.serieId !== null &&
    appointment.serieId !== undefined;

  const serienTag = (appointment?.occurrenceOn ?? appointment?.serieDatum ?? '')
    .split('-')
    .reverse()
    .join('.');

  const [fragtNachUmfang, setFragtNachUmfang] = useState(false);
  const [fragtNachAbsageUmfang, setFragtNachAbsageUmfang] = useState(false);
  const [fragtNachLoeschUmfang, setFragtNachLoeschUmfang] = useState(false);

  const [fehler, setFehler] = useState<string | null>(null);
  const [fragtNachLöschen, setFragtNachLöschen] = useState(false);
  const [konflikte, setKonflikte] = useState<AppointmentConflict[]>([]);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    if (allDay || startTime === '' || endTime === '') {
      setKonflikte([]);
      return;
    }

    let abgebrochen = false;

    const nachsehen = async (): Promise<void> => {
      try {
        const antwort = await client.query<{
          appointmentConflicts: AppointmentConflict[];
        }>({
          query: APPOINTMENT_CONFLICTS,
          variables: {
            startDate,
            startTime,
            endDate,
            endTime,
            ownerId: ownerId === '' ? null : ownerId,
            exceptId: appointment?.id ?? null,
          },
          fetchPolicy: 'network-only',
        });

        if (!abgebrochen) {
          setKonflikte(antwort.data.appointmentConflicts);
        }
      } catch {
        if (!abgebrochen) {
          setKonflikte([]);
        }
      }
    };

    const zeitgeber = setTimeout(() => void nachsehen(), 400);

    return () => {
      abgebrochen = true;
      clearTimeout(zeitgeber);
    };
  }, [
    client,
    startDate,
    startTime,
    endDate,
    endTime,
    ownerId,
    allDay,
    appointment?.id,
  ]);

  const sichern = async (scope: Umfang): Promise<void> => {
    setFehler(null);

    const eingabe = {
      title,
      description: description === '' ? null : description,
      location: location === '' ? null : location,
      videoLink: videoLink.trim(),
      startDate,
      startTime,
      endDate,
      endTime,
      allDay,
      ownerId: ownerId === '' ? null : ownerId,
      remindMinutesBefore: remind,
      privat,
      companyId: companyId === '' ? null : companyId,
      recurrence: toRule(wiederholung, startDate),
      attendees: runde.map((dabei) => ({
        contactId: dabei.contactId ?? null,
        userId: dabei.userId ?? null,
        email: dabei.email ?? null,
        name: dabei.name ?? null,
        status: dabei.status ?? 'NEEDS_ACTION',
      })),
    };

    let gespeichert: Appointment | undefined;

    try {
      if (appointment === null) {
        const antwort = await createAppointment({
          variables: { input: eingabe },
        });

        gespeichert = (
          antwort.data as { createAppointment?: Appointment } | null
        )?.createAppointment;
      } else {
        const antwort = await updateAppointment({
          variables: { input: { id: appointment.id, scope, ...eingabe } },
        });

        gespeichert = (
          antwort.data as { updateAppointment?: Appointment } | null
        )?.updateAppointment;
      }
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
      );

      return;
    }

    if (einladen && gespeichert !== undefined) {
      try {
        await einladungSenden({ variables: { id: gespeichert.seriesId } });
        zeige({ text: 'Die Einladung ist verschickt.' });
      } catch (problem) {
        zeige({
          text: `Gespeichert, aber die Einladung ging nicht hinaus: ${
            problem instanceof Error ? problem.message : 'Unbekannter Fehler.'
          }`,
        });
      }
    }

    onSaved();
  };

  const speichern = (event: FormEvent): void => {
    event.preventDefault();

    if (istSerientermin) {
      setFragtNachUmfang(true);
      return;
    }

    void sichern('SERIES');
  };

  const absagen = async (scope?: Umfang): Promise<void> => {
    if (appointment === null) {
      return;
    }

    setFehler(null);

    try {
      if (appointment.cancelledAt === null) {
        await cancelAppointment({
          variables: { id: appointment.id, scope: scope ?? null },
        });
      } else {
        await reinstateAppointment({ variables: { id: appointment.id } });
      }

      onSaved();
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
      );
    }
  };

  const löschen = async (scope?: Umfang): Promise<void> => {
    if (appointment === null) {
      return;
    }

    setFehler(null);

    try {
      await deleteAppointment({
        variables: { id: appointment.id, scope: scope ?? null },
      });
      onSaved();
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
      );
    }
  };

  return (
    <>
      {fragtNachUmfang && appointment !== null && (
        <ScopeDialog
          title="Welche Termine ändern?"
          consequence={`„${appointment.title}“ wiederholt sich: ${
            appointment.recurrenceText ?? 'als Serie'
          }. „Nur dieser Termin“ ändert den ${serienTag}, die Serie bleibt. „Dieser und alle folgenden“ ändert ab dem ${serienTag}, die Termine davor bleiben. „Alle Termine“ ändert jeden Tag der Serie; ändern sich dabei Rhythmus oder erster Tag, gelten einzeln geänderte Tage nicht mehr.`}
          onOne={() => {
            setFragtNachUmfang(false);
            void sichern('ONE');
          }}
          onFollowing={() => {
            setFragtNachUmfang(false);
            void sichern('FOLLOWING');
          }}
          onSeries={() => {
            setFragtNachUmfang(false);
            void sichern('SERIES');
          }}
          onCancel={() => setFragtNachUmfang(false)}
        />
      )}

      {fragtNachAbsageUmfang && appointment !== null && (
        <ScopeDialog
          title="Welche Termine absagen?"
          consequence={`„Nur dieser Termin“ sagt den ${serienTag} ab; er bleibt durchgestrichen im Kalender und lässt sich wieder aufnehmen. „Dieser und alle folgenden“ beendet die Serie vor dem ${serienTag}. „Alle Termine“ sagt die ganze Serie ab.`}
          onOne={() => {
            setFragtNachAbsageUmfang(false);
            void absagen('ONE');
          }}
          onFollowing={() => {
            setFragtNachAbsageUmfang(false);
            void absagen('FOLLOWING');
          }}
          onSeries={() => {
            setFragtNachAbsageUmfang(false);
            void absagen('SERIES');
          }}
          onCancel={() => setFragtNachAbsageUmfang(false)}
        />
      )}

      {fragtNachLoeschUmfang && appointment !== null && (
        <ScopeDialog
          gefaehrlich
          title="Welche Termine löschen?"
          consequence={`Gelöscht ist endgültig. „Nur dieser Termin“ nimmt den ${serienTag} aus der Serie. „Dieser und alle folgenden“ beendet die Serie vor dem ${serienTag}. „Alle Termine“ löscht die ganze Serie samt einzeln geänderter Tage. Wer sie schon als Datei bekommen hat, behält sie — dafür ist Absagen da.`}
          onOne={() => {
            setFragtNachLoeschUmfang(false);
            void löschen('ONE');
          }}
          onFollowing={() => {
            setFragtNachLoeschUmfang(false);
            void löschen('FOLLOWING');
          }}
          onSeries={() => {
            setFragtNachLoeschUmfang(false);
            void löschen('SERIES');
          }}
          onCancel={() => setFragtNachLoeschUmfang(false)}
        />
      )}

      {fragtNachLöschen && appointment !== null && (
        <ConfirmDialog
          title="Termin löschen?"
          consequence={`„${appointment.title}“ verschwindet endgültig, mit Notiz und Ort. Wer ihn schon als Datei bekommen hat, behält ihn trotzdem im eigenen Kalender — dafür ist Absagen da.`}
          confirmLabel="Endgültig löschen"
          onConfirm={() => void löschen()}
          onCancel={() => setFragtNachLöschen(false)}
        />
      )}

      <dialog
        ref={dialogRef}
        className="dialog dialog--wide"
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) {
            onClose();
          }
        }}
      >
        <form className="dialog__body" onSubmit={speichern}>
          <div className="dialog__title">
            {appointment === null ? 'Neuer Termin' : 'Termin ändern'}
          </div>

          {fehler !== null && (
            <div className="error-banner" role="alert">
              {fehler}
            </div>
          )}

          {istAusnahme && (
            <p className="field__hint">
              Einzeln geänderter Termin einer Serie, ursprünglich am {serienTag}
              . Was Sie hier ändern, gilt nur für ihn.
            </p>
          )}

          <div className="field field--wide">
            <label htmlFor="appointment-title">Titel</label>
            <input
              id="appointment-title"
              value={title}
              required
              maxLength={200}
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="appointment-start-date">Beginn</label>
            <div className="row-actions">
              <input
                id="appointment-start-date"
                type="date"
                value={startDate}
                required
                onChange={(event) => {
                  setStartDate(event.target.value);

                  if (endDate === startDate) {
                    setEndDate(event.target.value);
                  }
                }}
              />
              {!allDay && (
                <input
                  aria-label="Uhrzeit Beginn"
                  type="time"
                  value={startTime}
                  required
                  onChange={(event) => {
                    setStartTime(event.target.value);

                    if (
                      endDate === startDate &&
                      endTime <= event.target.value
                    ) {
                      setEndTime(plusHour(event.target.value));
                    }
                  }}
                />
              )}
            </div>
          </div>

          <div className="field">
            <label htmlFor="appointment-end-date">Ende</label>
            <div className="row-actions">
              <input
                id="appointment-end-date"
                type="date"
                value={endDate}
                required
                onChange={(event) => setEndDate(event.target.value)}
              />
              {!allDay && (
                <input
                  aria-label="Uhrzeit Ende"
                  type="time"
                  value={endTime}
                  required
                  onChange={(event) => setEndTime(event.target.value)}
                />
              )}
            </div>
          </div>

          <div className="field">
            <label htmlFor="appointment-all-day">
              <input
                id="appointment-all-day"
                type="checkbox"
                checked={allDay}
                onChange={(event) => setAllDay(event.target.checked)}
              />{' '}
              Ganztägig
            </label>
          </div>

          <div className="field">
            <label htmlFor="appointment-owner">Kalender von</label>
            <select
              id="appointment-owner"
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
            >
              <option value="">Ich selbst</option>
              {(team?.workspaceMembers ?? []).map((mitglied) => (
                <option key={mitglied.user.id} value={mitglied.user.id}>
                  {mitglied.user.firstName} {mitglied.user.lastName}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="appointment-remind">Erinnerung</label>
            <select
              id="appointment-remind"
              value={remind === null ? '' : String(remind)}
              onChange={(event) =>
                setRemind(
                  event.target.value === '' ? null : Number(event.target.value),
                )
              }
            >
              {REMINDER_CHOICES.map((wahl) => (
                <option
                  key={wahl.label}
                  value={wahl.value === null ? '' : String(wahl.value)}
                >
                  {wahl.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="appointment-company">Firma</label>
            <select
              id="appointment-company"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              <option value="">— keine —</option>
              {(firmen?.companies.items ?? []).map((firma) => (
                <option key={firma.id} value={firma.id}>
                  {firma.name}
                </option>
              ))}
            </select>
            <p className="field__hint">
              Der Termin steht dann auch in der Akte dieser Firma.
            </p>
          </div>

          <RecurrenceFields
            value={wiederholung}
            startDate={startDate}
            onChange={setWiederholung}
          />

          <AttendeeFields
            value={runde}
            contacts={kontakte?.contacts.items ?? []}
            team={team?.workspaceMembers ?? []}
            onChange={setRunde}
          />

          <div className="field field--wide">
            <label htmlFor="appointment-location">Ort</label>
            <input
              id="appointment-location"
              value={location}
              maxLength={300}
              placeholder="beim Kunden, Büro, Videoschalte"
              onChange={(event) => setLocation(event.target.value)}
            />
          </div>

          <div className="field field--wide">
            <label htmlFor="appointment-video">Videokonferenz</label>
            <input
              id="appointment-video"
              type="url"
              inputMode="url"
              value={videoLink}
              maxLength={500}
              placeholder="https://…"
              onChange={(event) => setVideoLink(event.target.value)}
            />
            <p className="field__hint">
              Link zu Teams, Zoom, Jitsi oder Meet. Er steht in der Einladung
              und im Kalender der Teilnehmer.
            </p>
          </div>

          <div className="field field--wide">
            <label htmlFor="appointment-description">Notiz</label>
            <textarea
              id="appointment-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="field field--wide">
            <label htmlFor="appointment-privat">
              <input
                id="appointment-privat"
                type="checkbox"
                checked={privat}
                aria-describedby="appointment-privat-hinweis"
                onChange={(event) => setPrivat(event.target.checked)}
              />{' '}
              Privat
            </label>
            <span id="appointment-privat-hinweis" className="field__hint">
              Kollegen sehen nur, dass die Zeit belegt ist — ohne Titel, Ort,
              Notiz und Teilnehmer. Im eigenen Kalender steht er ganz.
            </span>
          </div>

          {runde.length > 0 && (
            <div className="field">
              <label htmlFor="appointment-invite">
                <input
                  id="appointment-invite"
                  type="checkbox"
                  checked={einladen}
                  onChange={(event) => setEinladen(event.target.checked)}
                />{' '}
                Einladung senden
              </label>
              <span className="field__hint">
                Per Mail aus Ihrem Postfach, mit Zusagen und Absagen in Outlook,
                Apple und Google. Die Antworten erscheinen hier am Teilnehmer.
                {appointment?.eingeladenAm != null &&
                  ` Zuletzt eingeladen am ${new Date(
                    appointment.eingeladenAm,
                  ).toLocaleDateString(
                    'de-DE',
                  )}; erneut senden schickt den neuen Stand.`}
              </span>
            </div>
          )}

          {konflikte.length > 0 && (
            <div className="notice">
              <strong>Da liegt schon etwas.</strong>
              <ul>
                {konflikte.map((konflikt) => (
                  <li key={konflikt.appointment.id}>
                    {konflikt.appointment.startTime} bis{' '}
                    {konflikt.appointment.endTime} ·{' '}
                    {konflikt.appointment.title}{' '}
                    <span className="field__hint">
                      ({formatDuration(konflikt.minutes)} Überschneidung)
                    </span>
                  </li>
                ))}
              </ul>
              <p className="field__hint">
                Speichern geht trotzdem. Manchmal ist das so gewollt.
              </p>
            </div>
          )}

          <div className="dialog__actions">
            {appointment !== null && (
              <>
                <button
                  type="button"
                  className="button button--ghost button--danger"
                  onClick={() =>
                    istSerientermin || istAusnahme
                      ? setFragtNachLoeschUmfang(true)
                      : setFragtNachLöschen(true)
                  }
                >
                  Löschen
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => {
                    void downloadAppointmentIcs(
                      appointment.id,
                      `${appointment.startDate}-Termin.ics`,
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
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() =>
                    appointment.cancelledAt === null &&
                    (istSerientermin || istAusnahme)
                      ? setFragtNachAbsageUmfang(true)
                      : void absagen()
                  }
                >
                  {appointment.cancelledAt === null
                    ? 'Absagen'
                    : 'Wieder aufnehmen'}
                </button>
              </>
            )}
            <button
              type="button"
              className="button button--ghost"
              onClick={onClose}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="button"
              disabled={creating || updating}
            >
              {creating || updating ? 'Wird gespeichert…' : 'Speichern'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
};

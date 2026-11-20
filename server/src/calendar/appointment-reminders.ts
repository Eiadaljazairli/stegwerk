import { berlinDate, berlinTime } from './berlin-time';

export type RemindableAppointment = {
  id: string;
  title: string;
  location: string | null;
  videoLink?: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  remindMinutesBefore: number | null;
  remindedAt: Date | null;
  cancelledAt: Date | null;
};

export type ReminderVerdict = 'senden' | 'zu früh' | 'verfallen' | 'nichts';

export const reminderVerdict = (
  appointment: RemindableAppointment,
  now: Date,
): ReminderVerdict => {
  if (
    appointment.remindMinutesBefore === null ||
    appointment.remindedAt !== null ||
    appointment.cancelledAt !== null
  ) {
    return 'nichts';
  }

  const due =
    appointment.startsAt.getTime() - appointment.remindMinutesBefore * 60_000;

  if (now.getTime() < due) {
    return 'zu früh';
  }

  return now.getTime() < appointment.startsAt.getTime()
    ? 'senden'
    : 'verfallen';
};

export const LONGEST_LEAD_MINUTES = 10080;

const zeitangabe = (appointment: RemindableAppointment): string =>
  appointment.allDay
    ? `am ${berlinDate(appointment.startsAt)}, ganztägig`
    : `am ${berlinDate(appointment.startsAt)} um ${berlinTime(appointment.startsAt)} Uhr`;

export const reminderSubject = (appointment: RemindableAppointment): string =>
  `Erinnerung: ${appointment.title} ${zeitangabe(appointment)}`;

export const reminderText = (
  appointment: RemindableAppointment,
  greeting: string,
): string => {
  const zeilen = [
    `Hallo ${greeting},`,
    '',
    `zur Erinnerung: ${appointment.title} ${zeitangabe(appointment)}.`,
  ];

  if (appointment.location !== null && appointment.location !== '') {
    zeilen.push(`Ort: ${appointment.location}`);
  }

  if (
    appointment.videoLink !== null &&
    appointment.videoLink !== undefined &&
    appointment.videoLink !== ''
  ) {
    zeilen.push(`Videokonferenz: ${appointment.videoLink}`);
  }

  if (!appointment.allDay) {
    zeilen.push(`Ende: ${berlinTime(appointment.endsAt)} Uhr`);
  }

  zeilen.push(
    '',
    'Diese Erinnerung haben Sie selbst am Termin eingestellt. Im Kalender',
    'lässt sie sich dort auch wieder abschalten.',
  );

  return zeilen.join('\n');
};

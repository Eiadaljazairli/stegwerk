import { type Mail } from './mail.service';

const formatDate = (date: Date): string =>
  date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

export const retentionWarningMail = (
  to: string,
  workspaceName: string,
  deleteOn: Date,
  daysLeft: number,
  billingUrl: string,
): Mail => ({
  to,
  subject: `${workspaceName}: Daten werden am ${formatDate(deleteOn)} gelöscht`,
  text: [
    `Der Zugang zu "${workspaceName}" ist beendet, und wir bewahren die Daten`,
    `nicht länger auf als nötig. Am ${formatDate(deleteOn)} — in ${daysLeft} Tagen —`,
    'werden alle Firmen, Kontakte, Geschäfte, Aufgaben und Notizen dieses',
    'Arbeitsbereichs endgültig gelöscht. Das lässt sich danach nicht rückgängig',
    'machen.',
    '',
    'Sie haben zwei Möglichkeiten:',
    '',
    '1. Weiterarbeiten — wählen Sie einen Tarif, dann bleibt alles bestehen:',
    `   ${billingUrl}`,
    '',
    '2. Daten mitnehmen — laden Sie den vollständigen Export herunter, bevor',
    '   die Frist abläuft. Sie finden ihn unter "Daten" in Ihrem',
    '   Arbeitsbereich.',
    '',
    'Wenn Sie nichts tun, wird zum genannten Datum gelöscht.',
  ].join('\n'),
});

export const retentionDeletedMail = (
  to: string,
  workspaceName: string,
): Mail => ({
  to,
  subject: `${workspaceName}: Daten gelöscht`,
  text: [
    `Die Daten des Arbeitsbereichs "${workspaceName}" wurden heute wie`,
    'angekündigt gelöscht. Firmen, Kontakte, Geschäfte, Aufgaben und Notizen',
    'sind entfernt und lassen sich nicht wiederherstellen.',
    '',
    'Wenn Sie wieder mit Stegwerk arbeiten möchten, können Sie jederzeit',
    'einen neuen Arbeitsbereich anlegen.',
  ].join('\n'),
});

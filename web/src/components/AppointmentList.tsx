import { Link } from 'react-router-dom';

import { formatDuration, type RailAppointment } from '../lib/types';
import { todayInBerlin } from '../lib/calendar-grid';
import { VideoLink } from './VideoLink';

export const AppointmentList = ({
  appointments,
  emptyMessage,
  herkunft,
}: {
  appointments: RailAppointment[];
  emptyMessage: string;
  herkunft?: (termin: RailAppointment) => string | null;
}): JSX.Element => {
  const heute = todayInBerlin();

  if (appointments.length === 0) {
    return <p className="field__hint">{emptyMessage}</p>;
  }

  return (
    <ul className="appointment-list">
      {appointments.map((termin) => {
        const vergangen = termin.endDate < heute;

        return (
          <li
            key={termin.id}
            className={[
              'appointment-list__item',
              vergangen ? 'appointment-list__item--past' : '',
              termin.cancelledAt === null
                ? ''
                : 'appointment-list__item--cancelled',
              termin.geschwaerzt === true
                ? 'appointment-list__item--belegt'
                : '',
            ]
              .filter((klasse) => klasse !== '')
              .join(' ')}
          >
            <Link className="appointment-list__title" to="/kalender">
              {termin.title}
              {termin.geschwaerzt === true && (
                <span className="visually-hidden"> (privater Termin)</span>
              )}
            </Link>

            <div className="field__hint">
              {new Intl.DateTimeFormat('de-DE', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                timeZone: 'UTC',
              }).format(new Date(`${termin.startDate}T00:00:00Z`))}
              {termin.allDay
                ? ' · ganztägig'
                : ` · ${termin.startTime} · ${formatDuration(termin.minutes)}`}
              {termin.cancelledAt === null ? '' : ' · abgesagt'}
            </div>

            {herkunft?.(termin) != null && (
              <div className="field__hint">bei {herkunft(termin)}</div>
            )}
            {termin.location !== null && termin.location !== '' && (
              <div className="field__hint">{termin.location}</div>
            )}
            <VideoLink href={termin.videoLink} />
          </li>
        );
      })}
    </ul>
  );
};

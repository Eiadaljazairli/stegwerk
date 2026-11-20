import { useMemo, useRef, useState } from 'react';

import {
  dayLabel,
  daysOf,
  isWeekend,
  todayInBerlin,
  WEEKDAYS,
} from '../lib/calendar-grid';
import {
  daysFromPixels,
  isDrag,
  minutesFromPixels,
  moveLabel,
  movedTo,
  resizedTo,
  type Span,
} from '../lib/drag-move';
import { type Appointment, formatDuration } from '../lib/types';
import {
  layoutDay,
  MINUTES_PER_DAY,
  nowMinutes,
  visibleHours,
} from '../lib/week-grid';

const HOUR_HEIGHT = 46;

const timeLabel = (hour: number): string =>
  `${String(hour).padStart(2, '0')}:00`;

export const WeekView = ({
  days,
  appointments,
  onPick,
  onOpen,
  onMove,
}: {
  days: string[];
  appointments: Appointment[];
  onPick: (day: string, time: string) => void;
  onOpen: (appointment: Appointment) => void;
  onMove: (appointment: Appointment, span: Span) => void;
}): JSX.Element => {
  const heute = todayInBerlin();
  const jetzt = nowMinutes();

  const { from, to } = useMemo(
    () => visibleHours(appointments, days),
    [appointments, days],
  );

  const hours = useMemo(
    () => Array.from({ length: to - from }, (_, index) => from + index),
    [from, to],
  );

  const ganztaegig = useMemo(
    () =>
      days.map((day) =>
        appointments.filter(
          (termin) => termin.allDay && daysOf(termin).includes(day),
        ),
      ),
    [appointments, days],
  );

  const hatGanztaegige = ganztaegig.some((liste) => liste.length > 0);

  const höhe = (to - from) * HOUR_HEIGHT;

  const geste = useRef<{
    id: string;
    mode: 'move' | 'resize';
    from: { x: number; y: number };
    span: Span;
    allDay: boolean;
    ziel: Span | null;
  } | null>(null);

  const [entwurf, setEntwurf] = useState<{ id: string; span: Span } | null>(
    null,
  );

  const körper = useRef<HTMLDivElement>(null);

  const spaltenbreite = (): number => {
    const spalte = körper.current?.querySelector('.week__column');

    return spalte === null || spalte === undefined
      ? 0
      : spalte.getBoundingClientRect().width;
  };

  const beginnen = (
    event: React.PointerEvent<HTMLElement>,
    appointment: Appointment,
    mode: 'move' | 'resize',
  ): void => {
    event.currentTarget.setPointerCapture(event.pointerId);

    geste.current = {
      id: appointment.id,
      mode,
      from: { x: event.clientX, y: event.clientY },
      span: {
        startDate: appointment.startDate,
        startTime: appointment.startTime,
        endDate: appointment.endDate,
        endTime: appointment.endTime,
      },
      allDay: appointment.allDay,
      ziel: null,
    };
  };

  const ziehen = (event: React.PointerEvent<HTMLElement>): void => {
    const lauf = geste.current;

    if (lauf === null) {
      return;
    }

    const bis = { x: event.clientX, y: event.clientY };

    if (!isDrag(lauf.from, bis)) {
      return;
    }

    const minuten = minutesFromPixels(bis.y - lauf.from.y, HOUR_HEIGHT);

    if (lauf.mode === 'resize') {
      lauf.ziel = resizedTo(lauf.span, minuten);
      setEntwurf({ id: lauf.id, span: lauf.ziel });
      return;
    }

    const tage =
      days.length > 1
        ? daysFromPixels(bis.x - lauf.from.x, spaltenbreite())
        : 0;

    lauf.ziel = movedTo(lauf.span, { days: tage, minutes: minuten });
    setEntwurf({ id: lauf.id, span: lauf.ziel });
  };

  const loslassen = (appointment: Appointment): void => {
    const lauf = geste.current;

    geste.current = null;
    setEntwurf(null);

    if (lauf === null || lauf.id !== appointment.id || lauf.ziel === null) {
      onOpen(appointment);
      return;
    }

    onMove(appointment, lauf.ziel);
  };

  const anzeigen = (appointment: Appointment): Appointment =>
    entwurf !== null && entwurf.id === appointment.id
      ? { ...appointment, ...entwurf.span }
      : appointment;

  const zeitAus = (event: React.MouseEvent<HTMLDivElement>): string => {
    const kasten = event.currentTarget.getBoundingClientRect();
    const anteil = (event.clientY - kasten.top) / kasten.height;
    const minuten = from * 60 + anteil * (to - from) * 60;
    const gerundet = Math.max(
      0,
      Math.min(MINUTES_PER_DAY - 15, Math.round(minuten / 15) * 15),
    );

    return `${String(Math.floor(gerundet / 60)).padStart(2, '0')}:${String(
      gerundet % 60,
    ).padStart(2, '0')}`;
  };

  return (
    <div className="week">
      <div className="week__head">
        <div className="week__gutter" />
        {days.map((day, index) => (
          <div
            key={day}
            className={[
              'week__daycell',
              isWeekend(day) ? 'week__daycell--weekend' : '',
              day === heute ? 'week__daycell--today' : '',
            ]
              .filter((klasse) => klasse !== '')
              .join(' ')}
          >
            <div className="week__dayname">{WEEKDAYS[index]}</div>
            <div className="week__daynum">{Number(day.slice(8))}</div>
          </div>
        ))}
      </div>

      {hatGanztaegige && (
        <div className="week__allday">
          <div className="week__gutter week__gutter--allday">ganztägig</div>
          {days.map((day, index) => (
            <div
              key={day}
              className={
                isWeekend(day)
                  ? 'week__alldaycell week__alldaycell--weekend'
                  : 'week__alldaycell'
              }
            >
              {ganztaegig[index].map((termin) => (
                <button
                  key={termin.id}
                  type="button"
                  className={[
                    'week__chip',
                    termin.cancelledAt === null ? '' : 'week__chip--cancelled',
                    termin.geschwaerzt === true ? 'week__chip--belegt' : '',
                  ]
                    .filter((klasse) => klasse !== '')
                    .join(' ')}
                  title={termin.title}
                  onClick={() => onOpen(termin)}
                >
                  {termin.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="week__body" ref={körper}>
        <div className="week__gutter" style={{ height: `${String(höhe)}px` }}>
          {hours.map((hour) => (
            <div
              key={hour}
              className="week__hourlabel"
              style={{ height: `${String(HOUR_HEIGHT)}px` }}
            >
              {timeLabel(hour)}
            </div>
          ))}
        </div>

        {days.map((day) => {
          const platziert = layoutDay(appointments.map(anzeigen), day);

          return (
            <div
              key={day}
              className={[
                'week__column',
                isWeekend(day) ? 'week__column--weekend' : '',
                day === heute ? 'week__column--today' : '',
              ]
                .filter((klasse) => klasse !== '')
                .join(' ')}
              style={{ height: `${String(höhe)}px` }}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  onPick(day, zeitAus(event));
                }
              }}
              role="presentation"
            >
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="week__hourline"
                  style={{ height: `${String(HOUR_HEIGHT)}px` }}
                />
              ))}

              {day === heute && jetzt >= from * 60 && jetzt <= to * 60 && (
                <div
                  className="week__now"
                  style={{
                    top: `${String(((jetzt - from * 60) / ((to - from) * 60)) * 100)}%`,
                  }}
                  aria-hidden="true"
                />
              )}

              {platziert.map(({ item, top, height, column, columns }) => {
                const oben = ((top - from * 60) / ((to - from) * 60)) * 100;
                const hoch = (height / ((to - from) * 60)) * 100;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={[
                      'week__event',
                      item.cancelledAt === null ? '' : 'week__event--cancelled',
                      item.geschwaerzt === true ? 'week__event--belegt' : '',
                      height <= 30 ? 'week__event--tiny' : '',
                      entwurf !== null && entwurf.id === item.id
                        ? 'week__event--dragging'
                        : '',
                    ]
                      .filter((klasse) => klasse !== '')
                      .join(' ')}
                    onPointerDown={(event) => {
                      if (event.button === 0) {
                        beginnen(event, item, 'move');
                      }
                    }}
                    onPointerMove={ziehen}
                    onPointerUp={() => loslassen(item)}
                    onPointerCancel={() => {
                      geste.current = null;
                      setEntwurf(null);
                    }}
                    style={{
                      top: `${String(oben)}%`,
                      height: `${String(hoch)}%`,
                      left: `calc(${String((column / columns) * 100)}% + 2px)`,
                      width: `calc(${String((1 / columns) * 100)}% - 4px)`,
                    }}
                    title={`${item.startTime} bis ${item.endTime} · ${item.title}${
                      item.location === null ? '' : ` · ${item.location}`
                    }`}
                    aria-label={`${dayLabel(day)}, ${item.startTime} bis ${item.endTime}, ${item.title}`}
                  >
                    <span className="week__eventtime">{item.startTime}</span>{' '}
                    <span className="week__eventtitle">{item.title}</span>
                    {entwurf !== null && entwurf.id === item.id ? (
                      <span className="week__eventmeta">
                        {moveLabel(entwurf.span, item.allDay)}
                      </span>
                    ) : (
                      height > 60 && (
                        <span className="week__eventmeta">
                          {formatDuration(item.minutes)}
                          {item.location === null ? '' : ` · ${item.location}`}
                        </span>
                      )
                    )}
                    {height > 30 && (
                      <span
                        className="week__handle"
                        role="presentation"
                        onPointerDown={(griff) => {
                          if (griff.button === 0) {
                            griff.stopPropagation();
                            beginnen(griff, item, 'resize');
                          }
                        }}
                        onPointerMove={ziehen}
                        onPointerUp={(griff) => {
                          griff.stopPropagation();
                          loslassen(item);
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

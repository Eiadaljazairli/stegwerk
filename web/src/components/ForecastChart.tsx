import { useQuery } from '@apollo/client';

import { DEAL_FORECAST } from '../lib/queries';
import { formatCurrency } from '../lib/types';

type Monat = {
  month: string;
  dealCount: number;
  totalAmount: number;
  weightedAmount: number;
};

const MONATE = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

const name = (month: string): string =>
  month === 'offen'
    ? 'Ohne Datum'
    : `${MONATE[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`;

export const ForecastChart = () => {
  const { data } = useQuery<{
    dealForecast: {
      betraegeVerborgen: boolean;
      openAmount: number;
      weightedAmount: number;
      months: Monat[];
    };
  }>(DEAL_FORECAST, { variables: { months: 6 } });

  const prognose = data?.dealForecast;

  if (prognose === undefined) {
    return null;
  }

  if (prognose.betraegeVerborgen) {
    return (
      <div className="card forecast">
        <p className="notes__empty">Beträge sind für Ihre Rolle verborgen.</p>
      </div>
    );
  }

  const hoechster = Math.max(1, ...prognose.months.map((m) => m.totalAmount));

  return (
    <div className="card forecast">
      <div className="forecast__totals">
        <div>
          <div className="metric__label">Gewichtete Pipeline</div>
          <div className="forecast__big">
            {formatCurrency(prognose.weightedAmount)}
          </div>
        </div>
        <div>
          <div className="metric__label">Offen insgesamt</div>
          <div className="forecast__small">
            {formatCurrency(prognose.openAmount)}
          </div>
        </div>
      </div>

      <div className="forecast__bars" role="list">
        {prognose.months.map((monat) => (
          <div
            key={monat.month}
            className={
              monat.month === 'offen'
                ? 'forecast__month forecast__month--open'
                : 'forecast__month'
            }
            role="listitem"
            title={`${String(monat.dealCount)} Geschäfte · ${formatCurrency(monat.totalAmount)} voll · ${formatCurrency(monat.weightedAmount)} gewichtet`}
          >
            <div className="forecast__value">
              {monat.weightedAmount > 0
                ? formatCurrency(monat.weightedAmount)
                : '—'}
            </div>
            <div className="forecast__track">
              <div
                className="forecast__bar forecast__bar--total"
                style={{
                  height: `${String((monat.totalAmount / hoechster) * 100)}%`,
                }}
              />
              <div
                className="forecast__bar forecast__bar--weighted"
                style={{
                  height: `${String((monat.weightedAmount / hoechster) * 100)}%`,
                }}
              />
            </div>
            <div className="forecast__label">{name(monat.month)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

import { formatMoney } from '../lib/types';

export type StatusTab = {
  key: string;
  label: string;
  count: number;
  sumCents?: number;
  warn?: boolean;
};

export const StatusTabs = ({
  tabs,
  active,
  onChange,
}: {
  tabs: StatusTab[];
  active: string;
  onChange: (key: string) => void;
}) => {
  const mitBetrag = tabs.some((tab) => tab.sumCents !== undefined);

  return (
    <div className="status-tabs" role="tablist" aria-label="Nach Status">
      {tabs.map((tab) => {
        const klassen = ['status-tabs__tab'];

        if (tab.key === active) {
          klassen.push('is-active');
        }

        if (tab.warn === true && tab.count > 0) {
          klassen.push('status-tabs__tab--warn');
        }

        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={tab.key === active}
            className={klassen.join(' ')}
            onClick={() => onChange(tab.key)}
          >
            <span className="status-tabs__label">
              {tab.label}
              <span className="status-tabs__count">{tab.count}</span>
            </span>
            {mitBetrag && (
              <span className="status-tabs__sum">
                {tab.sumCents === undefined ? (
                  <span className="status-tabs__ohne" aria-label="kein Betrag">
                    —
                  </span>
                ) : (
                  formatMoney(tab.sumCents)
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

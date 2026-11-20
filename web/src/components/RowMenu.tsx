import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { IconCheck } from './Icons';

export type RowMenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  gewaehlt?: boolean;
};

export const RowMenu = ({
  label,
  items,
  ausloeser,
}: {
  label: string;
  items: RowMenuItem[];
  ausloeser?: { inhalt: ReactNode; className: string };
}) => {
  const [lage, setLage] = useState<{ top: number; right: number } | null>(null);
  const knopf = useRef<HTMLButtonElement>(null);
  const menue = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panel = menue.current;
    const rahmen = knopf.current?.getBoundingClientRect();

    if (lage === null || panel === null || rahmen === undefined) {
      return;
    }

    const { height: hoehe, width: breite } = panel.getBoundingClientRect();
    const neu = { ...lage };

    if (lage.top + hoehe > window.innerHeight - 8) {
      neu.top = Math.max(8, rahmen.top - 4 - hoehe);
    }

    if (window.innerWidth - lage.right - breite < 8) {
      neu.right = Math.max(8, window.innerWidth - 8 - breite);
    }

    if (neu.top !== lage.top || neu.right !== lage.right) {
      setLage(neu);
    }
  }, [lage]);

  useEffect(() => {
    if (lage === null) {
      return;
    }

    const schliessen = () => setLage(null);
    const beiKlick = (event: MouseEvent) => {
      const ziel = event.target as Node;

      if (!menue.current?.contains(ziel) && !knopf.current?.contains(ziel)) {
        schliessen();
      }
    };
    const beiTaste = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        schliessen();
        knopf.current?.focus();
      }
    };

    window.addEventListener('mousedown', beiKlick);
    window.addEventListener('keydown', beiTaste);
    window.addEventListener('scroll', schliessen, true);
    window.addEventListener('resize', schliessen);
    menue.current?.querySelector<HTMLButtonElement>('button')?.focus();

    return () => {
      window.removeEventListener('mousedown', beiKlick);
      window.removeEventListener('keydown', beiTaste);
      window.removeEventListener('scroll', schliessen, true);
      window.removeEventListener('resize', schliessen);
    };
  }, [lage]);

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <button
        ref={knopf}
        type="button"
        className={ausloeser?.className ?? 'row-menu__button'}
        aria-label={label}
        title={ausloeser === undefined ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={lage !== null}
        onClick={() => {
          if (lage !== null) {
            setLage(null);

            return;
          }

          const rahmen = knopf.current?.getBoundingClientRect();

          if (rahmen !== undefined) {
            setLage({
              top: rahmen.bottom + 4,
              right: window.innerWidth - rahmen.right,
            });
          }
        }}
      >
        {ausloeser?.inhalt ?? (
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="3" cy="8" r="1.5" fill="currentColor" />
            <circle cx="8" cy="8" r="1.5" fill="currentColor" />
            <circle cx="13" cy="8" r="1.5" fill="currentColor" />
          </svg>
        )}
      </button>

      {lage !== null && (
        <div
          ref={menue}
          className="menu-panel row-menu__panel"
          role="menu"
          style={{ top: lage.top, right: lage.right }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role={item.gewaehlt === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={item.gewaehlt}
              className={
                item.danger === true
                  ? 'menu-panel__item menu-panel__item--danger'
                  : 'menu-panel__item'
              }
              onClick={() => {
                setLage(null);
                item.onSelect();
              }}
            >
              {item.gewaehlt === true && (
                <span className="row-menu__haken" aria-hidden="true">
                  <IconCheck size={14} />
                </span>
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
};

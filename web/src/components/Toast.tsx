import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { IconClose } from './Icons';

type Hinweis = {
  id: number;
  text: string;
  aktion?: { label: string; onClick: () => void };
};

type ToastKontext = { zeige: (hinweis: Omit<Hinweis, 'id'>) => void };

const Kontext = createContext<ToastKontext>({ zeige: () => undefined });

const DAUER_MS = 5000;
const DAUER_MIT_AKTION_MS = 9000;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [hinweise, setHinweise] = useState<Hinweis[]>([]);
  const naechste = useRef(1);
  const uhren = useRef(new Map<number, number>());

  const schliessen = useCallback((id: number) => {
    setHinweise((alle) => alle.filter((h) => h.id !== id));
    window.clearTimeout(uhren.current.get(id));
    uhren.current.delete(id);
  }, []);

  const zeige = useCallback(
    (hinweis: Omit<Hinweis, 'id'>) => {
      const id = naechste.current++;

      setHinweise((alle) => [...alle.slice(-2), { ...hinweis, id }]);
      uhren.current.set(
        id,
        window.setTimeout(
          () => schliessen(id),
          hinweis.aktion === undefined ? DAUER_MS : DAUER_MIT_AKTION_MS,
        ),
      );
    },
    [schliessen],
  );

  useEffect(() => {
    const alle = uhren.current;

    return () => alle.forEach((uhr) => window.clearTimeout(uhr));
  }, []);

  const wert = useMemo(() => ({ zeige }), [zeige]);

  return (
    <Kontext.Provider value={wert}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {hinweise.map((hinweis) => (
          <div key={hinweis.id} className="toast">
            <span>{hinweis.text}</span>
            {hinweis.aktion !== undefined && (
              <button
                type="button"
                className="toast__aktion"
                onClick={() => {
                  hinweis.aktion?.onClick();
                  schliessen(hinweis.id);
                }}
              >
                {hinweis.aktion.label}
              </button>
            )}
            <button
              type="button"
              className="toast__zu"
              aria-label="Hinweis schließen"
              onClick={() => schliessen(hinweis.id)}
            >
              <IconClose size={14} />
            </button>
          </div>
        ))}
      </div>
    </Kontext.Provider>
  );
};

export const useToast = (): ToastKontext => useContext(Kontext);

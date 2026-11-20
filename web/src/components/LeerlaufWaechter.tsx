import { useQuery } from '@apollo/client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../lib/auth';
import {
  beobachteEingaben,
  eingabenZaehlen,
  letzteEingabe,
  type LeerlaufStand,
  leerlaufStand,
  merkeAbmeldegrund,
  merkeEingabe,
} from '../lib/leerlauf';
import { LEERLAUF } from '../lib/queries';

export const LeerlaufWaechter = () => {
  const { session, endSession } = useAuth();
  const navigate = useNavigate();
  const { data, error } = useQuery<{
    myWorkspaces: {
      workspace: { id: string; leerlaufMinuten: number | null };
    }[];
  }>(LEERLAUF);
  const minuten =
    data?.myWorkspaces.find((m) => m.workspace.id === session?.workspace.id)
      ?.workspace.leerlaufMinuten ?? null;
  const [stand, setStand] = useState<LeerlaufStand>({ art: 'aktiv' });
  const fristBekannt = data !== undefined || error !== undefined;
  const [zaehlt, setZaehlt] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    if (zaehlt) {
      return;
    }

    if (eingabenZaehlen(fristBekannt, letzteEingabe(), minuten, Date.now())) {
      setZaehlt(true);
    }
  }, [zaehlt, fristBekannt, minuten]);

  useEffect(() => {
    if (!zaehlt) {
      return undefined;
    }

    return beobachteEingaben(window);
  }, [zaehlt]);

  useLayoutEffect(() => {
    if (minuten === null) {
      setStand({ art: 'aktiv' });

      return undefined;
    }

    const pruefen = () =>
      setStand(leerlaufStand(letzteEingabe(), minuten, Date.now()));
    const takt = window.setInterval(pruefen, 1000);

    pruefen();

    return () => window.clearInterval(takt);
  }, [minuten]);

  useLayoutEffect(() => {
    if (stand.art === 'abgelaufen') {
      merkeAbmeldegrund('leerlauf');
      endSession();
      navigate('/anmelden');
    }
  }, [stand.art, endSession, navigate]);

  const warnt = stand.art === 'warnung';

  useEffect(() => {
    const element = dialog.current;

    if (warnt && element !== null && !element.open) {
      element.showModal();
    }

    if (!warnt && element?.open === true) {
      element.close();
    }
  }, [warnt]);

  if (minuten === null) {
    return null;
  }

  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby="leerlauf-titel"
      onCancel={(event) => {
        event.preventDefault();
        merkeEingabe(Date.now(), true);
      }}
    >
      <div className="dialog__body">
        <div id="leerlauf-titel" className="dialog__title">
          Noch da?
        </div>
        <p className="dialog__consequence" role="timer" aria-live="polite">
          Ohne Eingabe werden Sie in{' '}
          {stand.art === 'warnung' ? String(stand.sekunden) : '60'} Sekunden
          abgemeldet. Das hat Ihr Arbeitsbereich so eingestellt.
        </p>
        <div className="dialog__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => merkeEingabe(Date.now(), true)}
          >
            Angemeldet bleiben
          </button>
        </div>
      </div>
    </dialog>
  );
};

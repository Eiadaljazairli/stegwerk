import { useApolloClient } from '@apollo/client';
import { useEffect, useState } from 'react';

import { API_ROOT } from './download';
import {
  aenderungenMelden,
  aufAenderungenHoeren,
  betrifft,
  fremdeAenderungAn,
  kuerzlicheAenderungAn,
  type LiveAenderung,
  liesAenderungen,
  type LiveObjekt,
  TAB_KENNUNG,
  wartezeit,
} from './live';
import { LIVE_TICKET } from './queries';

const SAMMELN_MS = 250;

export const useLiveVerbindung = (bereichId: string | null): void => {
  const client = useApolloClient();

  useEffect(() => {
    if (bereichId === null || typeof EventSource === 'undefined') {
      return undefined;
    }

    let beendet = false;
    let quelle: EventSource | null = null;
    let alte: EventSource | null = null;
    let verbindet = false;
    let versuch = 0;
    let warten: ReturnType<typeof setTimeout> | undefined;
    let sammeln: ReturnType<typeof setTimeout> | undefined;
    let schonVerbunden = false;
    let alles = false;
    const objekte = new Set<LiveObjekt>();

    const nachladen = () => {
      if (sammeln !== undefined) {
        return;
      }

      sammeln = setTimeout(() => {
        sammeln = undefined;

        const jetzt = new Set(objekte);
        const ganz = alles;

        objekte.clear();
        alles = false;

        void client
          .refetchQueries({
            include: 'active',
            onQueryUpdated: (beobachtet) =>
              ganz ||
              betrifft(
                jetzt,
                beobachtet.query,
                beobachtet.getCurrentResult().data,
              ),
          })
          .catch(() => undefined);
      }, SAMMELN_MS);
    };

    const spaeterVerbinden = () => {
      if (beendet) {
        return;
      }

      clearTimeout(warten);
      warten = setTimeout(() => void verbinden(), wartezeit(versuch));
      versuch += 1;
    };

    const verbinden = async () => {
      if (beendet || quelle !== null || verbindet) {
        return;
      }

      verbindet = true;

      let ticket: string | null = null;

      try {
        const { data } = await client.mutate<{ liveTicket: string }>({
          mutation: LIVE_TICKET,
          fetchPolicy: 'no-cache',
        });

        ticket = data?.liveTicket ?? null;
      } catch {
        ticket = null;
      }

      verbindet = false;

      if (beendet) {
        return;
      }

      if (ticket === null) {
        spaeterVerbinden();

        return;
      }

      const strom = new EventSource(
        `${API_ROOT}/live?ticket=${encodeURIComponent(ticket)}`,
      );

      quelle = strom;

      strom.addEventListener('bereit', () => {
        versuch = 0;

        const nahtlos = alte !== null && alte.readyState !== EventSource.CLOSED;

        alte?.close();
        alte = null;

        if (schonVerbunden && !nahtlos) {
          alles = true;
          nachladen();
        }

        schonVerbunden = true;
      });

      strom.addEventListener('wechsel', () => {
        if (quelle !== strom) {
          return;
        }

        alte = strom;
        quelle = null;
        clearTimeout(warten);
        versuch = 0;
        void verbinden();
      });

      strom.addEventListener('verdraengt', () => {
        strom.close();

        if (quelle === strom) {
          quelle = null;
          clearTimeout(warten);
        }
      });

      strom.addEventListener('aenderungen', (ereignis) => {
        const aenderungen = liesAenderungen((ereignis as MessageEvent).data);

        aenderungenMelden(aenderungen);

        for (const aenderung of aenderungen) {
          if (aenderung.tab !== TAB_KENNUNG) {
            objekte.add(aenderung.objekt);
          }
        }

        if (objekte.size > 0) {
          nachladen();
        }
      });

      strom.addEventListener('nachladen', () => {
        alles = true;
        nachladen();
      });

      strom.onerror = () => {
        strom.close();

        if (alte === strom) {
          alte = null;

          return;
        }

        if (quelle !== strom) {
          return;
        }

        quelle = null;
        spaeterVerbinden();
      };
    };

    const wiederDa = () => {
      if (quelle === null) {
        clearTimeout(warten);
        versuch = 0;
        void verbinden();
      }
    };

    const sichtbar = () => {
      if (document.visibilityState === 'visible') {
        wiederDa();
      }
    };

    window.addEventListener('online', wiederDa);
    window.addEventListener('focus', wiederDa);
    document.addEventListener('visibilitychange', sichtbar);
    void verbinden();

    return () => {
      beendet = true;
      window.removeEventListener('online', wiederDa);
      window.removeEventListener('focus', wiederDa);
      document.removeEventListener('visibilitychange', sichtbar);
      clearTimeout(warten);
      clearTimeout(sammeln);
      quelle?.close();
      quelle = null;
      alte?.close();
      alte = null;
    };
  }, [bereichId, client]);
};

export const useFremdeAenderung = (
  objekt: LiveObjekt,
  id: string,
): [LiveAenderung | null, () => void] => {
  const schluessel = `${objekt}:${id}`;
  const [stand, setStand] = useState<{
    schluessel: string;
    aenderung: LiveAenderung;
  } | null>(() => {
    const kuerzlich = kuerzlicheAenderungAn(objekt, id);

    return kuerzlich === null ? null : { schluessel, aenderung: kuerzlich };
  });

  useEffect(
    () =>
      aufAenderungenHoeren((aenderungen) => {
        const treffer = fremdeAenderungAn(aenderungen, objekt, id);

        if (treffer !== null) {
          setStand({ schluessel, aenderung: treffer });
        }
      }),
    [objekt, id, schluessel],
  );

  return [
    stand?.schluessel === schluessel ? stand.aenderung : null,
    () => setStand(null),
  ];
};

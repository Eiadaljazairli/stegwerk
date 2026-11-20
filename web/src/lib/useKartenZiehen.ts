import {
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from 'react';

import { aktivierungFuer } from './boardZiehen';

export type ZiehZustand = { dealId: string; ziel: string | null } | null;

const RAND = 48;
const SCHRITT = 16;

const zielUnter = (x: number, y: number): string | null => {
  const element = document.elementFromPoint(x, y);
  const spalte = element?.closest<HTMLElement>('[data-board-ziel]');

  return spalte?.dataset.boardZiel ?? null;
};

const randRollen = (board: HTMLElement | null, x: number, y: number) => {
  if (board !== null) {
    const rahmen = board.getBoundingClientRect();

    if (x < rahmen.left + RAND) {
      board.scrollLeft -= SCHRITT;
    } else if (x > rahmen.right - RAND) {
      board.scrollLeft += SCHRITT;
    }
  }

  if (y < RAND) {
    window.scrollBy(0, -SCHRITT);
  } else if (y > window.innerHeight - RAND) {
    window.scrollBy(0, SCHRITT);
  }
};

export const useKartenZiehen = (
  ablegen: (dealId: string, ziel: string) => void,
) => {
  const [zustand, setZustand] = useState<ZiehZustand>(null);
  const ablegenRef = useRef(ablegen);
  ablegenRef.current = ablegen;

  const onPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    dealId: string,
  ) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    if ((event.target as HTMLElement).closest('button') !== null) {
      return;
    }

    const karte = event.currentTarget;
    const board = karte.closest<HTMLElement>('.board');
    const pointerId = event.pointerId;
    const start = { x: event.clientX, y: event.clientY };
    const regel = aktivierungFuer(event.pointerType);
    let aktiv = false;
    let ziel: string | null = null;
    let geist: HTMLElement | null = null;
    let timer: number | undefined;

    const aktivieren = (x: number, y: number) => {
      aktiv = true;
      const rahmen = karte.getBoundingClientRect();

      geist = karte.cloneNode(true) as HTMLElement;
      geist.classList.add('board__card--geist');
      geist.removeAttribute('id');
      geist.setAttribute('aria-hidden', 'true');
      Object.assign(geist.style, {
        left: `${String(rahmen.left)}px`,
        top: `${String(rahmen.top)}px`,
        width: `${String(rahmen.width)}px`,
      });
      document.body.appendChild(geist);
      document.body.classList.add('ist-ziehen');
      navigator.vibrate?.(10);
      bewegen(x, y);
    };

    const bewegen = (x: number, y: number) => {
      if (geist !== null) {
        geist.style.transform = `translate(${String(x - start.x)}px, ${String(
          y - start.y,
        )}px) rotate(1.5deg)`;
      }

      ziel = zielUnter(x, y);
      setZustand({ dealId, ziel });
      randRollen(board, x, y);
    };

    const aufraeumen = () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', beiBewegung);
      window.removeEventListener('pointerup', beiEnde);
      window.removeEventListener('pointercancel', beiAbbruch);
      window.removeEventListener('touchmove', festhalten);
      window.removeEventListener('contextmenu', ohneMenue);
      window.removeEventListener('keydown', beiTaste, true);
      geist?.remove();
      document.body.classList.remove('ist-ziehen');
      setZustand(null);
    };

    const beiBewegung = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) {
        return;
      }

      if (aktiv) {
        bewegen(e.clientX, e.clientY);

        return;
      }

      const weg = Math.hypot(e.clientX - start.x, e.clientY - start.y);

      if (regel.art === 'halten' && weg > regel.toleranz) {
        aufraeumen();
      } else if (regel.art === 'abstand' && weg >= regel.px) {
        aktivieren(e.clientX, e.clientY);
      }
    };

    const beiEnde = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) {
        return;
      }

      const war = aktiv;
      const wohin = ziel;

      aufraeumen();

      if (!war) {
        return;
      }

      const schlucken = (klick: MouseEvent) => {
        klick.preventDefault();
        klick.stopPropagation();
      };

      window.addEventListener('click', schlucken, true);
      window.setTimeout(
        () => window.removeEventListener('click', schlucken, true),
        0,
      );

      if (wohin !== null) {
        ablegenRef.current(dealId, wohin);
      }
    };

    const beiAbbruch = (e: PointerEvent) => {
      if (e.pointerId === pointerId) {
        aufraeumen();
      }
    };

    const festhalten = (e: TouchEvent) => {
      if (aktiv && e.cancelable) {
        e.preventDefault();
      }
    };

    const ohneMenue = (e: Event) => e.preventDefault();

    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        aufraeumen();
      }
    };

    window.addEventListener('pointermove', beiBewegung);
    window.addEventListener('pointerup', beiEnde);
    window.addEventListener('pointercancel', beiAbbruch);
    window.addEventListener('touchmove', festhalten, { passive: false });
    window.addEventListener('keydown', beiTaste, true);

    if (regel.art === 'halten') {
      window.addEventListener('contextmenu', ohneMenue);
      timer = window.setTimeout(() => aktivieren(start.x, start.y), regel.ms);
    }
  };

  return { zustand, onPointerDown };
};

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export const Anker = ({ id }: { id: string }) => (
  <span id={id} className="anker" aria-hidden="true" />
);

export const ankerAusHash = (hash: string): string | null => {
  if (hash.length < 2) {
    return null;
  }

  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return null;
  }
};

const WARTEN_MS = 3000;

const EIGENES_SCROLLEN = ['wheel', 'touchmove', 'keydown', 'mousedown'];

export const useAnkerSprung = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const id = ankerAusHash(hash);

    if (id === null) {
      return undefined;
    }

    const ende = Date.now() + WARTEN_MS;
    let zeitgeber = 0;
    let vorbei = false;
    const aufhoeren = () => {
      vorbei = true;
    };

    const lauschen = window.setTimeout(() => {
      for (const art of EIGENES_SCROLLEN) {
        window.addEventListener(art, aufhoeren, { passive: true });
      }
    }, 0);

    const nachfuehren = () => {
      if (vorbei) {
        return;
      }

      const ziel = document.getElementById(id);

      if (ziel !== null && Math.abs(ziel.getBoundingClientRect().top) > 120) {
        ziel.scrollIntoView({ block: 'start' });
      }

      if (Date.now() < ende) {
        zeitgeber = window.setTimeout(nachfuehren, 150);
      }
    };

    nachfuehren();

    return () => {
      window.clearTimeout(lauschen);
      window.clearTimeout(zeitgeber);

      for (const art of EIGENES_SCROLLEN) {
        window.removeEventListener(art, aufhoeren);
      }
    };
  }, [pathname, hash]);
};

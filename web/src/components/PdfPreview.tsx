import { useEffect, useRef, useState } from 'react';

import { fetchFromApi } from '../lib/download';
import { AbhilfeLink } from './AbhilfeLink';

const PDF_WARTEZEIT_MS = 20_000;

export const zeichnePdf = async (
  daten: ArrayBuffer,
  ziel: HTMLDivElement,
  abgebrochen: () => boolean,
): Promise<void> => {
  const pdfjs = await import('pdfjs-dist');

  if (pdfjs.GlobalWorkerOptions.workerPort === null) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
      { type: 'module' },
    );
  }

  const worker = pdfjs.GlobalWorkerOptions.workerPort;

  let zeitgeber = 0;
  let scheitern = () => {};
  const workerFehler = new Promise<never>((_aufgeloest, abgelehnt) => {
    scheitern = () => {
      worker.terminate();

      if (pdfjs.GlobalWorkerOptions.workerPort === worker) {
        pdfjs.GlobalWorkerOptions.workerPort = null;
      }

      abgelehnt(new Error('Die Vorschau ließ sich nicht starten.'));
    };

    worker.addEventListener('error', scheitern, { once: true });
    zeitgeber = window.setTimeout(scheitern, PDF_WARTEZEIT_MS);
  });

  const aufgabe = pdfjs.getDocument({
    data: new Uint8Array(daten),
    isEvalSupported: false,
  });
  const dokument = await Promise.race([aufgabe.promise, workerFehler]).finally(
    () => {
      window.clearTimeout(zeitgeber);
      worker.removeEventListener('error', scheitern);
    },
  );

  const breite = ziel.clientWidth;
  const dichte = window.devicePixelRatio || 1;
  const seiten: HTMLCanvasElement[] = [];

  for (let nummer = 1; nummer <= dokument.numPages; nummer += 1) {
    const seite = await dokument.getPage(nummer);
    const masstab = breite / seite.getViewport({ scale: 1 }).width;
    const ansicht = seite.getViewport({ scale: masstab * dichte });
    const leinwand = document.createElement('canvas');

    leinwand.width = Math.floor(ansicht.width);
    leinwand.height = Math.floor(ansicht.height);
    leinwand.className = 'pdf-preview__page';
    leinwand.setAttribute('aria-label', `Seite ${String(nummer)}`);

    const kontext = leinwand.getContext('2d');

    if (kontext === null) {
      continue;
    }

    await seite.render({ canvasContext: kontext, viewport: ansicht }).promise;
    seiten.push(leinwand);
  }

  await dokument.destroy();

  if (!abgebrochen()) {
    ziel.replaceChildren(...seiten);
  }
};

const breitGenug = (): boolean =>
  window.matchMedia('(min-width: 1360px)').matches;

export const PdfPreview = ({
  path,
  version,
  initiallyOpen = breitGenug(),
}: {
  path: string;
  version: string;
  initiallyOpen?: boolean;
}) => {
  const [offen, setOffen] = useState(initiallyOpen);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const flaeche = useRef<HTMLDivElement>(null);
  const schonGezeichnet = useRef(false);

  useEffect(() => {
    if (!offen) {
      return;
    }

    let abgebrochen = false;

    const zeitgeber = window.setTimeout(
      () => {
        const ziel = flaeche.current;

        if (ziel === null) {
          return;
        }

        schonGezeichnet.current = true;
        setLaedt(true);
        setFehler(null);
        void import('pdfjs-dist').catch(() => null);

        void fetchFromApi(path)
          .then((antwort) => antwort.arrayBuffer())
          .then((daten) => zeichnePdf(daten, ziel, () => abgebrochen))
          .catch((problem: unknown) => {
            if (!abgebrochen) {
              setFehler(
                problem instanceof Error
                  ? problem.message
                  : 'Die Vorschau ließ sich nicht zeichnen.',
              );
            }
          })
          .finally(() => {
            if (!abgebrochen) {
              setLaedt(false);
            }
          });
      },
      schonGezeichnet.current ? 400 : 0,
    );

    return () => {
      abgebrochen = true;
      window.clearTimeout(zeitgeber);
    };
  }, [offen, path, version]);

  return (
    <section className="card pdf-preview">
      <div className="pdf-preview__head">
        <h2>Vorschau</h2>
        {laedt && <span className="field__hint">wird gezeichnet…</span>}
        <button
          type="button"
          className="button button--ghost"
          aria-expanded={offen}
          onClick={() => setOffen(!offen)}
        >
          {offen ? 'Ausblenden' : 'Anzeigen'}
        </button>
      </div>
      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
          <AbhilfeLink id="pdf-vorschau" />
        </div>
      )}
      {offen && <div className="pdf-preview__pages" ref={flaeche} />}
    </section>
  );
};

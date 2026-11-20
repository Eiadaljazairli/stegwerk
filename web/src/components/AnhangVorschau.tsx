import { useEffect, useRef, useState } from 'react';

import { fetchFromApi } from '../lib/download';
import { alsDataUrl, bildTyp, istPdf, type VorschauArt } from '../lib/vorschau';
import { zeichnePdf } from './PdfPreview';

type Stand =
  | { art: 'laedt' }
  | { art: 'pdf' }
  | { art: 'bild'; url: string }
  | { art: 'keine'; grund: string }
  | { art: 'fehler'; meldung: string };

export const AnhangVorschau = ({
  anhangId,
  name,
  art,
  onHerunterladen,
  onSchliessen,
}: {
  anhangId: string;
  name: string;
  art: VorschauArt;
  onHerunterladen: () => void;
  onSchliessen: () => void;
}) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const flaeche = useRef<HTMLDivElement>(null);
  const [stand, setStand] = useState<Stand>(
    art === 'office'
      ? {
          art: 'keine',
          grund:
            'Für Office-Dateien gibt es hier keine Vorschau: dafür müsste die Datei an einen fremden Dienst gehen. Laden Sie sie herunter.',
        }
      : { art: 'laedt' },
  );

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    if (art === 'office') {
      return undefined;
    }

    let abgebrochen = false;

    void fetchFromApi(`/attachments/${anhangId}`)
      .then((antwort) => antwort.arrayBuffer())
      .then(async (daten) => {
        const bytes = new Uint8Array(daten);

        if (art === 'pdf' && istPdf(bytes)) {
          setStand({ art: 'pdf' });
          await new Promise((fertig) => requestAnimationFrame(fertig));

          if (flaeche.current !== null && !abgebrochen) {
            await zeichnePdf(daten, flaeche.current, () => abgebrochen);
          }

          return;
        }

        const typ = bildTyp(bytes);

        if (art === 'bild' && typ !== null) {
          setStand({ art: 'bild', url: alsDataUrl(bytes, typ) });

          return;
        }

        setStand({
          art: 'keine',
          grund:
            'Der Inhalt passt nicht zur Endung der Datei; gezeigt wird er deshalb nicht.',
        });
      })
      .catch((problem: unknown) => {
        if (!abgebrochen) {
          setStand({
            art: 'fehler',
            meldung:
              problem instanceof Error
                ? problem.message
                : 'Die Vorschau ließ sich nicht laden.',
          });
        }
      });

    return () => {
      abgebrochen = true;
    };
  }, [anhangId, art]);

  return (
    <dialog
      ref={dialog}
      className="dialog anhang-vorschau"
      aria-label={`Vorschau: ${name}`}
      onCancel={(ereignis) => {
        ereignis.preventDefault();
        onSchliessen();
      }}
      onClick={(ereignis) => {
        if (ereignis.target === dialog.current) {
          onSchliessen();
        }
      }}
    >
      <div className="dialog__body anhang-vorschau__body">
        <div className="anhang-vorschau__kopf">
          <div className="dialog__title">{name}</div>
          <button
            type="button"
            className="button button--ghost"
            onClick={onHerunterladen}
          >
            Herunterladen
          </button>
          <button type="button" className="button" onClick={onSchliessen}>
            Schließen
          </button>
        </div>

        {stand.art === 'laedt' && <p className="field__hint">Wird geladen…</p>}
        {stand.art === 'fehler' && (
          <div className="error-banner" role="alert">
            {stand.meldung}
          </div>
        )}
        {stand.art === 'keine' && <p className="field__hint">{stand.grund}</p>}
        {stand.art === 'bild' && (
          <img className="anhang-vorschau__bild" src={stand.url} alt={name} />
        )}
        {stand.art === 'pdf' && (
          <div className="pdf-preview__pages" ref={flaeche} />
        )}
      </div>
    </dialog>
  );
};

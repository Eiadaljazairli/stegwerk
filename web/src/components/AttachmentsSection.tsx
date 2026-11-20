import { useMutation, useQuery } from '@apollo/client';
import { useRef, useState } from 'react';

import { downloadAttachment, uploadAttachment } from '../lib/download';
import { vorschauArt } from '../lib/vorschau';
import { AnhangVorschau } from './AnhangVorschau';
import { ATTACHMENTS, DELETE_ATTACHMENT } from '../lib/queries';
import { type Attachment } from '../lib/types';

export type AttachmentZiel = {
  companyId?: string;
  contactId?: string;
  dealId?: string;
  quoteId?: string;
  invoiceId?: string;
  taskId?: string;
  noteId?: string;
};

export const lesbareGroesse = (bytes: number): string => {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const AttachmentsSection = ({ ziel }: { ziel: AttachmentZiel }) => {
  const feld = useRef<HTMLInputElement>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [ziehtDarueber, setZiehtDarueber] = useState(false);
  const [angesehen, setAngesehen] = useState<Attachment | null>(null);

  const { data, loading, refetch } = useQuery<{ attachments: Attachment[] }>(
    ATTACHMENTS,
    { variables: ziel },
  );

  const [entfernen] = useMutation(DELETE_ATTACHMENT);

  const anhaenge = data?.attachments ?? [];

  const hochladen = async (dateien: FileList | null): Promise<void> => {
    if (dateien === null || dateien.length === 0) {
      return;
    }

    setFehler(null);
    setLaeuft(true);

    try {
      for (const datei of Array.from(dateien)) {
        await uploadAttachment(ziel, datei);
      }

      await refetch();
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
      );
    } finally {
      setLaeuft(false);

      if (feld.current !== null) {
        feld.current.value = '';
      }
    }
  };

  const holen = async (anhang: Attachment): Promise<void> => {
    setFehler(null);

    try {
      await downloadAttachment(anhang.id, anhang.name);
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
      );
    }
  };

  const loeschen = async (anhang: Attachment): Promise<void> => {
    if (
      !window.confirm(
        `"${anhang.name}" löschen? Das lässt sich nicht rückgängig machen.`,
      )
    ) {
      return;
    }

    setFehler(null);

    try {
      await entfernen({ variables: { id: anhang.id } });
      await refetch();
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
      );
    }
  };

  return (
    <section
      className={`detail-section${ziehtDarueber ? ' detail-section--ablage' : ''}`}
      onDragOver={(ereignis) => {
        if (laeuft || !ereignis.dataTransfer.types.includes('Files')) {
          return;
        }

        ereignis.preventDefault();
        ereignis.dataTransfer.dropEffect = 'copy';
        setZiehtDarueber(true);
      }}
      onDragLeave={(ereignis) => {
        if (!ereignis.currentTarget.contains(ereignis.relatedTarget as Node)) {
          setZiehtDarueber(false);
        }
      }}
      onDrop={(ereignis) => {
        if (!ereignis.dataTransfer.types.includes('Files')) {
          return;
        }

        ereignis.preventDefault();
        setZiehtDarueber(false);

        if (!laeuft) {
          void hochladen(ereignis.dataTransfer.files);
        }
      }}
    >
      <div className="section-heading">
        <h2>Dateien</h2>
        <button
          type="button"
          className="button button--quiet"
          disabled={laeuft}
          onClick={() => feld.current?.click()}
        >
          {laeuft ? 'Wird hochgeladen…' : 'Datei anhängen'}
        </button>
      </div>

      <input
        ref={feld}
        type="file"
        multiple
        hidden
        onChange={(ereignis) => void hochladen(ereignis.target.files)}
      />

      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}

      {loading ? (
        <p className="field__hint">Wird geladen…</p>
      ) : anhaenge.length === 0 ? (
        <p className="field__hint">
          Noch keine Dateien. Hierher ziehen oder „Datei anhängen“; bis 20 MB je
          Datei, Seiten und Programme werden nicht angenommen.
        </p>
      ) : (
        <ul className="attachments">
          {anhaenge.map((anhang) => (
            <li key={anhang.id} className="attachments__item">
              <button
                type="button"
                className="attachments__name"
                onClick={() => void holen(anhang)}
              >
                {anhang.name}
              </button>

              {vorschauArt(anhang.name) !== null && (
                <button
                  type="button"
                  className="attachments__ansehen"
                  aria-label={`${anhang.name} ansehen`}
                  onClick={() => setAngesehen(anhang)}
                >
                  Ansehen
                </button>
              )}

              <span className="attachments__meta">
                {lesbareGroesse(anhang.sizeBytes)}
                {anhang.uploadedBy === null
                  ? ''
                  : ` · ${anhang.uploadedBy.firstName} ${anhang.uploadedBy.lastName}`}
                {' · '}
                {new Date(anhang.createdAt).toLocaleDateString('de-DE')}
              </span>

              <button
                type="button"
                className="attachments__remove"
                aria-label={`${anhang.name} löschen`}
                onClick={() => void loeschen(anhang)}
              >
                Löschen
              </button>
            </li>
          ))}
        </ul>
      )}

      {angesehen !== null && (
        <AnhangVorschau
          anhangId={angesehen.id}
          name={angesehen.name}
          art={vorschauArt(angesehen.name) ?? 'office'}
          onHerunterladen={() => void holen(angesehen)}
          onSchliessen={() => setAngesehen(null)}
        />
      )}
    </section>
  );
};

import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';

import {
  type AuditEntry,
  buildFeed,
  FEED_ARTEN,
  type FeedArt,
  type FeedAttachment,
  type FeedNote,
  filterFeed,
  gemerkteFeedArt,
  merkeFeedArt,
} from '../lib/activity';
import { downloadAttachment } from '../lib/download';
import {
  ATTACHMENTS,
  DELETE_NOTE,
  RECORD_ACTIVITY,
  SETZE_NOTIZ_ZIELE,
  UPDATE_NOTE,
} from '../lib/queries';
import { schalteHaken } from '../lib/formatierter-text';
import { type Attachment, type Note } from '../lib/types';
import { type ZielSpalte } from '../lib/verknuepfungen';
import { AktenVerknuepfungen } from './AktenVerknuepfungen';
import { AttachmentsSection } from './AttachmentsSection';
import { FormatierterText } from './FormatierterText';
import { TextEditor } from './TextEditor';
import { IconArrowRight } from './Icons';

const RECENT = 40;

const timestamp = (iso: string): string =>
  new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));

const groesse = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const Notiz = ({
  noteId,
  body,
  bearbeitet,
  akten,
  hier,
  onDeleted,
}: {
  noteId: string;
  body: string;
  bearbeitet: { am: string; von: string } | null;
  akten: Note | undefined;
  hier: Partial<Record<ZielSpalte, string>>;
  onDeleted: () => void;
}) => {
  const [entwurf, setEntwurf] = useState<string | null>(null);
  const [hakenFehler, setHakenFehler] = useState<string | null>(null);
  const [dateienOffen, setDateienOffen] = useState(false);
  const [speichern, { loading, error }] = useMutation(UPDATE_NOTE);
  const [loeschen] = useMutation(DELETE_NOTE);
  const [zieleSetzen] = useMutation(SETZE_NOTIZ_ZIELE);

  if (entwurf !== null) {
    return (
      <form
        className="feed__edit"
        onSubmit={(event) => {
          event.preventDefault();

          if (entwurf.trim() === '') {
            return;
          }

          void speichern({
            variables: { input: { id: noteId, body: entwurf.trim() } },
          })
            .then(() => setEntwurf(null))
            .catch(() => null);
        }}
      >
        {error !== undefined && (
          <div className="error-banner">{error.message}</div>
        )}
        <TextEditor
          label="Notiz bearbeiten"
          value={entwurf}
          autoFocus
          onChange={setEntwurf}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setEntwurf(null);
            }
          }}
        />
        <div className="feed__edit-actions">
          <button
            type="submit"
            className="button"
            disabled={loading || entwurf.trim() === ''}
          >
            Speichern
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setEntwurf(null)}
          >
            Abbrechen
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      {hakenFehler !== null && (
        <div className="error-banner">{hakenFehler}</div>
      )}
      <FormatierterText
        className="feed__note"
        text={body}
        onHaken={(nummer) => {
          setHakenFehler(null);
          void speichern({
            variables: {
              input: { id: noteId, body: schalteHaken(body, nummer) },
            },
          }).catch((fehler: unknown) =>
            setHakenFehler(
              fehler instanceof Error
                ? fehler.message
                : 'Der Haken ließ sich nicht setzen.',
            ),
          );
        }}
      />
      <div className="feed__note-foot">
        {bearbeitet !== null && (
          <span className="feed__edited">
            bearbeitet von {bearbeitet.von}, {timestamp(bearbeitet.am)}
          </span>
        )}
        <button
          type="button"
          className="feed__link"
          onClick={() => setEntwurf(body)}
        >
          Bearbeiten
        </button>
        <button
          type="button"
          className="feed__link"
          aria-expanded={dateienOffen}
          onClick={() => setDateienOffen(!dateienOffen)}
        >
          Dateien
        </button>
        <button
          type="button"
          className="feed__link feed__link--danger"
          onClick={() => {
            if (window.confirm('Diese Notiz löschen?')) {
              void loeschen({ variables: { id: noteId } })
                .then(onDeleted)
                .catch(() => null);
            }
          }}
        >
          Löschen
        </button>
      </div>
      {akten !== undefined && (
        <AktenVerknuepfungen
          eintrag={akten}
          hier={hier}
          mindestensEine
          onSetzen={async (spalte, id) => {
            await zieleSetzen({
              variables: { input: { id: noteId, [spalte]: id } },
            });
            onDeleted();
          }}
        />
      )}
      {dateienOffen && (
        <div className="feed__dateien">
          <AttachmentsSection ziel={{ noteId }} />
        </div>
      )}
    </>
  );
};

export const ActivityFeed = ({
  recordId,
  target,
  notes,
  onChanged,
}: {
  recordId: string;
  target: { companyId?: string; contactId?: string; dealId?: string };
  notes: Note[];
  onChanged: () => void;
}) => {
  const [art, setArt] = useState<FeedArt>(gemerkteFeedArt);
  const { data } = useQuery<{ auditLog: AuditEntry[] }>(RECORD_ACTIVITY, {
    variables: { entityId: recordId, limit: RECENT },
  });

  const { data: dateien } = useQuery<{ attachments: Attachment[] }>(
    ATTACHMENTS,
    { variables: target },
  );

  const feed = buildFeed(
    notes as FeedNote[],
    data?.auditLog ?? [],
    (dateien?.attachments ?? []).map(
      (anhang): FeedAttachment => ({
        id: anhang.id,
        name: anhang.name,
        sizeBytes: anhang.sizeBytes,
        createdAt: anhang.createdAt,
        uploaderName:
          anhang.uploadedBy === null
            ? 'Unbekannt'
            : `${anhang.uploadedBy.firstName} ${anhang.uploadedBy.lastName}`,
      }),
    ),
  );

  if (feed.length === 0) {
    return <p className="related__empty">Noch nichts passiert.</p>;
  }

  const sichtbar = filterFeed(feed, art);
  const notizNach = new Map(notes.map((notiz) => [notiz.id, notiz]));

  return (
    <>
      <div
        className="feed__filter"
        role="group"
        aria-label="Zeitleiste filtern"
      >
        {FEED_ARTEN.map((option) => (
          <button
            key={option.wert}
            type="button"
            className="zeit-chip"
            aria-pressed={art === option.wert}
            onClick={() => {
              setArt(option.wert);
              merkeFeedArt(option.wert);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {sichtbar.length === 0 && (
        <p className="related__empty">Hierzu ist noch nichts passiert.</p>
      )}

      <ol className="feed">
        {sichtbar.map((item) => (
          <li key={item.id} className={`feed__item feed__item--${item.kind}`}>
            <div className="feed__meta">
              <span className="feed__author">{item.author}</span>
              {item.kind === 'note' && item.herkunft !== undefined && (
                <span className="feed__herkunft">bei {item.herkunft}</span>
              )}
              <span className="feed__time">{timestamp(item.at)}</span>
            </div>

            {item.kind === 'note' ? (
              <Notiz
                noteId={item.noteId}
                body={item.body}
                bearbeitet={item.bearbeitet}
                akten={notizNach.get(item.noteId)}
                hier={target}
                onDeleted={onChanged}
              />
            ) : item.kind === 'attachment' ? (
              <p className="feed__event">
                Datei angehängt:{' '}
                <button
                  type="button"
                  className="feed__file"
                  onClick={() =>
                    void downloadAttachment(item.attachmentId, item.name)
                  }
                >
                  {item.name}
                </button>{' '}
                <span className="feed__size">{groesse(item.sizeBytes)}</span>
              </p>
            ) : item.created ? (
              <p className="feed__event">Eintrag angelegt.</p>
            ) : (
              <>
                {item.herkunft !== undefined && (
                  <p className="feed__herkunft">{item.herkunft}</p>
                )}
                <ul className="feed__changes">
                  {item.changes.map((change) => (
                    <li key={change.label}>
                      <span className="feed__field">{change.label}</span>
                      <span className="feed__from">{change.from}</span>
                      <span className="feed__arrow">
                        <IconArrowRight size={12} />
                        <span className="visually-hidden">wurde zu</span>
                      </span>
                      <span className="feed__to">{change.to}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </li>
        ))}
      </ol>
    </>
  );
};

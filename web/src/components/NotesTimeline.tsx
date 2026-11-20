import { useMutation } from '@apollo/client';
import { type FormEvent, useState } from 'react';

import { CREATE_NOTE, DELETE_NOTE } from '../lib/queries';
import { type Note } from '../lib/types';
import {
  type ZielVorschlag,
  zielMitVorschlaegen,
  ZIEL_SPALTEN,
} from '../lib/verknuepfungen';
import { FormatierterText } from './FormatierterText';
import { TextEditor } from './TextEditor';

type NotesTimelineProps = {
  notes: Note[];
  target: { companyId?: string; contactId?: string; dealId?: string };
  vorschlaege?: ZielVorschlag[];
  onChanged: () => void;
  formOnly?: boolean;
};

const formatTimestamp = (isoDate: string): string =>
  new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(isoDate));

export const NotesTimeline = ({
  notes,
  target,
  onChanged,
  formOnly = false,
  vorschlaege = [],
}: NotesTimelineProps) => {
  const [body, setBody] = useState('');
  const [auchBei, setAuchBei] = useState<ReadonlySet<string>>(new Set());

  const [createNote, { loading, error }] = useMutation(CREATE_NOTE);
  const [deleteNote] = useMutation(DELETE_NOTE);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (body.trim() === '') {
      return;
    }

    const result = await createNote({
      variables: {
        input: {
          body: body.trim(),
          ...zielMitVorschlaegen(target, vorschlaege, auchBei),
        },
      },
    }).catch(() => null);

    if (result?.data !== undefined && result.data !== null) {
      setBody('');
      setAuchBei(new Set());
      onChanged();
    }
  };

  const handleDelete = async (id: string) => {
    await deleteNote({ variables: { id } }).catch(() => null);
    onChanged();
  };

  return (
    <section className="notes">
      {!formOnly && <h2>Notizen</h2>}

      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}

      <form className="notes__form" onSubmit={handleSubmit}>
        <TextEditor
          label="Neue Notiz"
          placeholder="Notiz hinzufügen…"
          value={body}
          onChange={setBody}
        />
        {vorschlaege.length > 0 && (
          <fieldset className="notes__auch">
            <legend>Auch zeigen bei</legend>
            {vorschlaege.map((vorschlag) => (
              <label key={vorschlag.id} className="notes__auch-wahl">
                <input
                  type="checkbox"
                  checked={auchBei.has(vorschlag.id)}
                  onChange={(event) => {
                    const neu = new Set(auchBei);

                    if (event.target.checked) {
                      neu.add(vorschlag.id);
                    } else {
                      neu.delete(vorschlag.id);
                    }

                    setAuchBei(neu);
                  }}
                />
                {vorschlag.label}
                <span className="notes__auch-art">
                  {
                    ZIEL_SPALTEN.find(
                      (ziel) => ziel.spalte === vorschlag.spalte,
                    )?.label
                  }
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <button
          className="button"
          type="submit"
          disabled={loading || body.trim() === ''}
        >
          Speichern
        </button>
      </form>

      {formOnly ? null : notes.length === 0 ? (
        <p className="notes__empty">Noch keine Notizen.</p>
      ) : (
        <ul className="notes__list">
          {notes.map((note) => (
            <li className="notes__item" key={note.id}>
              <div className="notes__meta">
                <span className="notes__author">{note.authorName}</span>
                <span className="notes__time">
                  {formatTimestamp(note.createdAt)}
                </span>
                <button
                  type="button"
                  className="button button--danger row-action"
                  onClick={() => void handleDelete(note.id)}
                >
                  Löschen
                </button>
              </div>
              <FormatierterText className="notes__body" text={note.body} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

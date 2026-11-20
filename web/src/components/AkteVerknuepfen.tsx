import { useMutation } from '@apollo/client';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { type AuswahlTreffer } from '../lib/auswahl';
import { CREATE_DEAL } from '../lib/queries';
import { type AuswahlArt, DatensatzAuswahl } from './DatensatzAuswahl';

export const NeuesGeschaeft = ({
  vorbelegung,
}: {
  vorbelegung: { companyId?: string | null; primaryContactId?: string };
}) => {
  const navigate = useNavigate();
  const [offen, setOffen] = useState(false);
  const [name, setName] = useState('');
  const [anlegen, { loading, error }] = useMutation<{
    createDeal: { id: string };
  }>(CREATE_DEAL);

  if (!offen) {
    return (
      <button
        type="button"
        className="button button--ghost button--small"
        onClick={() => setOffen(true)}
      >
        Neues Geschäft
      </button>
    );
  }

  return (
    <form
      className="akte-neu"
      onSubmit={(ereignis) => {
        ereignis.preventDefault();

        if (name.trim() === '') {
          return;
        }

        void anlegen({
          variables: {
            input: {
              name: name.trim(),
              ...(vorbelegung.companyId == null
                ? {}
                : { companyId: vorbelegung.companyId }),
              ...(vorbelegung.primaryContactId === undefined
                ? {}
                : { primaryContactId: vorbelegung.primaryContactId }),
            },
          },
        })
          .then(({ data }) => {
            if (data != null) {
              void navigate(`/geschaefte/${data.createDeal.id}`);
            }
          })
          .catch(() => null);
      }}
    >
      <input
        aria-label="Bezeichnung des neuen Geschäfts"
        placeholder="Bezeichnung"
        maxLength={200}
        autoFocus
        value={name}
        onChange={(ereignis) => setName(ereignis.target.value)}
        onKeyDown={(ereignis) => {
          if (ereignis.key === 'Escape') {
            setOffen(false);
          }
        }}
      />
      <button
        type="submit"
        className="button"
        disabled={loading || name.trim() === ''}
      >
        Anlegen
      </button>
      <button
        type="button"
        className="button button--ghost"
        onClick={() => setOffen(false)}
      >
        Abbrechen
      </button>
      {error !== undefined && (
        <div className="error-banner" role="alert">
          {error.message}
        </div>
      )}
    </form>
  );
};

export const VerknuepfenKnopf = ({
  text,
  art,
  ausser,
  onWaehlen,
  onNeu,
}: {
  text: string;
  art: AuswahlArt;
  ausser?: readonly string[];
  onWaehlen: (treffer: AuswahlTreffer) => Promise<unknown>;
  onNeu?: (text: string) => Promise<unknown>;
}) => {
  const [offen, setOffen] = useState(false);

  if (!offen) {
    return (
      <button
        type="button"
        className="button button--ghost button--small"
        onClick={() => setOffen(true)}
      >
        {text}
      </button>
    );
  }

  return (
    <div className="akte-verknuepfen">
      <DatensatzAuswahl
        art={art}
        label={text}
        ausser={ausser}
        onWaehlen={async (treffer) => {
          await onWaehlen(treffer);
          setOffen(false);
        }}
        onNeu={
          onNeu === undefined
            ? undefined
            : async (eingabe) => {
                await onNeu(eingabe);
                setOffen(false);
              }
        }
        onAbbrechen={() => setOffen(false)}
      />
    </div>
  );
};

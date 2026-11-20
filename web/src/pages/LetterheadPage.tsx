import { useMutation, useQuery } from '@apollo/client';
import { useRef, useState } from 'react';

import { LoadingAnnouncement } from '../components/Skeleton';
import { uploadLetterheadLogo } from '../lib/download';
import {
  LETTERHEAD,
  LETTERHEAD_LOGO,
  REMOVE_LETTERHEAD_LOGO,
  UPDATE_LETTERHEAD,
} from '../lib/queries';
import { type Letterhead, type LetterheadGap } from '../lib/types';

type Data = { letterhead: Letterhead; letterheadGaps: LetterheadGap[] };

type FieldSpec = {
  key: keyof Letterhead;
  label: string;
  hint?: string;
  wide?: boolean;
};

const SECTIONS: { title: string; note?: string; fields: FieldSpec[] }[] = [
  {
    title: 'Absender',
    note: 'Erscheint über der Empfängeranschrift und im Fuß jeder Seite.',
    fields: [
      { key: 'companyName', label: 'Firmenname', wide: true },
      { key: 'street', label: 'Straße und Hausnummer', wide: true },
      { key: 'postalCode', label: 'PLZ' },
      { key: 'city', label: 'Ort' },
      { key: 'country', label: 'Land' },
      { key: 'phone', label: 'Telefon' },
      { key: 'email', label: 'E-Mail' },
      { key: 'website', label: 'Website' },
    ],
  },
  {
    title: 'Pflichtangaben',
    note: 'Nach § 35a GmbHG und den Entsprechungen je Rechtsform gehören diese auf jeden Geschäftsbrief.',
    fields: [
      {
        key: 'representative',
        label: 'Vertretungsberechtigte:r',
        hint: 'Geschäftsführung oder Inhaber:in',
        wide: true,
      },
      {
        key: 'registerEntry',
        label: 'Handelsregister',
        hint: 'z. B. Amtsgericht Hamburg HRB 123456. Bei Einzelunternehmen leer.',
        wide: true,
      },
      { key: 'taxNumber', label: 'Steuernummer' },
      { key: 'vatId', label: 'USt-IdNr.', hint: 'z. B. DE123456789' },
    ],
  },
  {
    title: 'Bankverbindung',
    note: 'Die IBAN wird beim Speichern auf ihre Prüfziffern geprüft.',
    fields: [
      { key: 'bankName', label: 'Bank' },
      { key: 'iban', label: 'IBAN' },
      { key: 'bic', label: 'BIC' },
    ],
  },
];

const LOGO_MAX_BYTES = 1024 * 1024;

const LogoAbschnitt = () => {
  const feld = useRef<HTMLInputElement>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const { data, refetch } = useQuery<{
    letterhead: { id: string; logoDataUrl: string | null };
  }>(LETTERHEAD_LOGO);
  const [entfernen, { loading: entfernt }] = useMutation(
    REMOVE_LETTERHEAD_LOGO,
  );

  const logo = data?.letterhead.logoDataUrl ?? null;

  const hochladen = async (dateien: FileList | null): Promise<void> => {
    const datei = dateien?.[0];

    if (datei === undefined) {
      return;
    }

    setFehler(null);

    if (datei.size > LOGO_MAX_BYTES) {
      setFehler('Das Logo ist größer als 1 MB.');
    } else {
      setLaeuft(true);

      try {
        await uploadLetterheadLogo(datei);
        await refetch();
      } catch (problem) {
        setFehler(
          problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
        );
      } finally {
        setLaeuft(false);
      }
    }

    if (feld.current !== null) {
      feld.current.value = '';
    }
  };

  return (
    <section className="card letterhead__section">
      <h2>Logo</h2>
      <p className="field__hint letterhead__note">
        Steht oben rechts auf jedem Angebot und jeder Rechnung. PNG oder JPEG,
        höchstens 1 MB; am besten breiter als hoch und mit hellem oder
        durchsichtigem Hintergrund.
      </p>

      {fehler !== null && <div className="error-banner">{fehler}</div>}

      <div className="logo-upload">
        <div className="logo-upload__preview">
          {logo === null ? (
            <span className="field__hint">Noch kein Logo</span>
          ) : (
            <img src={logo} alt="Firmenlogo" />
          )}
        </div>
        <div className="logo-upload__actions">
          <input
            ref={feld}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(event) => void hochladen(event.target.files)}
          />
          <button
            type="button"
            className="button button--ghost"
            disabled={laeuft}
            onClick={() => feld.current?.click()}
          >
            {laeuft
              ? 'Wird hochgeladen…'
              : logo === null
                ? 'Logo hochladen'
                : 'Logo ersetzen'}
          </button>
          {logo !== null && (
            <button
              type="button"
              className="button button--ghost"
              disabled={entfernt}
              onClick={() =>
                void entfernen().catch((problem: unknown) =>
                  setFehler(
                    problem instanceof Error
                      ? problem.message
                      : 'Unbekannter Fehler.',
                  ),
                )
              }
            >
              Entfernen
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

const asText = (value: Letterhead[keyof Letterhead]): string =>
  value === null || value === undefined ? '' : String(value);

export const LetterheadPage = () => {
  const { data, loading, error } = useQuery<Data>(LETTERHEAD);
  const [updateLetterhead, { loading: saving, error: saveError }] = useMutation(
    UPDATE_LETTERHEAD,
    { refetchQueries: [LETTERHEAD] },
  );

  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [saved, setSaved] = useState(false);

  const letterhead = data?.letterhead;
  const gaps = data?.letterheadGaps ?? [];

  if (loading && letterhead === undefined) {
    return <LoadingAnnouncement />;
  }

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  if (letterhead === undefined) {
    return null;
  }

  const value = (key: keyof Letterhead): string =>
    draft?.[key] ?? asText(letterhead[key]);

  const set = (key: keyof Letterhead, next: string) => {
    setSaved(false);
    setDraft({ ...draft, [key]: next });
  };

  const save = async () => {
    if (draft === null) {
      return;
    }

    const input: Record<string, unknown> = { ...draft };

    if (typeof input.smallBusiness === 'string') {
      input.smallBusiness = input.smallBusiness === 'true';
    }

    if (typeof input.defaultValidityDays === 'string') {
      const days = Number.parseInt(input.defaultValidityDays, 10);

      if (Number.isNaN(days)) {
        delete input.defaultValidityDays;
      } else {
        input.defaultValidityDays = days;
      }
    }

    const result = await updateLetterhead({ variables: { input } }).catch(
      () => null,
    );

    if (result?.data !== undefined && result.data !== null) {
      setDraft(null);
      setSaved(true);
    }
  };

  return (
    <>
      <div className="page__header">
        <div>
          <h1>Briefkopf</h1>
          <p className="page__subtitle">
            Ihre Angaben auf jedem Angebot. Nicht zu verwechseln mit dem
            Impressum dieser Installation unter Daten.
          </p>
        </div>
        <button
          type="button"
          className="button"
          disabled={draft === null || saving}
          onClick={() => void save()}
        >
          {saving ? 'Wird gespeichert…' : 'Speichern'}
        </button>
      </div>

      {saveError !== undefined && (
        <div className="error-banner">{saveError.message}</div>
      )}

      {saved && draft === null && (
        <div className="notice notice--positive">Briefkopf gespeichert.</div>
      )}

      {gaps.length > 0 && draft === null && (
        <div className="notice">
          Angebote gehen derzeit ohne diese Angaben hinaus:{' '}
          <strong>{gaps.map((gap) => gap.label).join(', ')}</strong>. Auf einem
          deutschen Geschäftsbrief werden sie erwartet.
        </div>
      )}

      <LogoAbschnitt />

      {SECTIONS.map((section) => (
        <section key={section.title} className="card letterhead__section">
          <h2>{section.title}</h2>
          {section.note !== undefined && (
            <p className="field__hint letterhead__note">{section.note}</p>
          )}

          <div className="letterhead__grid">
            {section.fields.map((field) => (
              <div
                key={field.key}
                className={field.wide === true ? 'field field--wide' : 'field'}
              >
                <label htmlFor={`letterhead-${field.key}`}>{field.label}</label>
                <input
                  id={`letterhead-${field.key}`}
                  value={value(field.key)}
                  onChange={(event) => set(field.key, event.target.value)}
                />
                {field.hint !== undefined && (
                  <p className="field__hint">{field.hint}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="card letterhead__section">
        <h2>DATEV</h2>
        <p className="field__hint letterhead__note">
          Für den Export der Rechnungen an Ihre Steuerkanzlei. Berater- und
          Mandantennummer bekommen Sie von der Kanzlei.
        </p>

        <div className="letterhead__grid">
          <div className="field">
            <label htmlFor="letterhead-datev-berater">Beraternummer</label>
            <input
              id="letterhead-datev-berater"
              inputMode="numeric"
              value={value('datevBeraternummer')}
              onChange={(event) =>
                set('datevBeraternummer', event.target.value)
              }
            />
          </div>
          <div className="field">
            <label htmlFor="letterhead-datev-mandant">Mandantennummer</label>
            <input
              id="letterhead-datev-mandant"
              inputMode="numeric"
              value={value('datevMandantennummer')}
              onChange={(event) =>
                set('datevMandantennummer', event.target.value)
              }
            />
          </div>
          <div className="field">
            <label htmlFor="letterhead-datev-skr">Kontenrahmen</label>
            <select
              id="letterhead-datev-skr"
              value={value('datevKontenrahmen')}
              onChange={(event) => set('datevKontenrahmen', event.target.value)}
            >
              <option value="SKR03">SKR03</option>
              <option value="SKR04">SKR04</option>
            </select>
            <p className="field__hint">Fragen Sie im Zweifel die Kanzlei.</p>
          </div>
        </div>
      </section>

      <section className="card letterhead__section">
        <h2>Vorgaben für neue Angebote</h2>
        <p className="field__hint letterhead__note">
          Gelten für das nächste Angebot. Ein bereits geschriebenes behält, was
          darauf steht.
        </p>

        <div className="letterhead__grid">
          <div className="field">
            <label htmlFor="letterhead-validity">Gültigkeit in Tagen</label>
            <input
              id="letterhead-validity"
              type="number"
              min="1"
              max="365"
              value={value('defaultValidityDays')}
              onChange={(event) =>
                set('defaultValidityDays', event.target.value)
              }
            />
          </div>

          <div className="field field--wide">
            <label className="letterhead__check" htmlFor="letterhead-small">
              <input
                id="letterhead-small"
                type="checkbox"
                checked={
                  draft?.smallBusiness === undefined
                    ? letterhead.smallBusiness
                    : draft.smallBusiness === 'true'
                }
                onChange={(event) =>
                  set('smallBusiness', String(event.target.checked))
                }
              />
              Kleinunternehmer nach § 19 UStG
            </label>
            <p className="field__hint">
              Neue Angebote weisen dann keine Umsatzsteuer aus und sagen es auf
              dem Dokument.
            </p>
          </div>

          <div className="field field--wide">
            <label htmlFor="letterhead-intro">Einleitungstext</label>
            <textarea
              id="letterhead-intro"
              rows={3}
              value={value('defaultIntroText')}
              onChange={(event) => set('defaultIntroText', event.target.value)}
            />
          </div>

          <div className="field field--wide">
            <label htmlFor="letterhead-closing">Schlusstext</label>
            <textarea
              id="letterhead-closing"
              rows={3}
              value={value('defaultClosingText')}
              onChange={(event) =>
                set('defaultClosingText', event.target.value)
              }
            />
          </div>
        </div>
      </section>
    </>
  );
};

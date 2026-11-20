import { type FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { NACHWEIS_KOPF } from '../lib/arbeitsnachweis';
import { API_ROOT } from '../lib/download';
import { useArbeitsnachweis } from '../lib/useArbeitsnachweis';

type Formular = {
  title: string;
  intro: string | null;
  thankYou: string;
  privacyUrl: string | null;
  company: string | null;
};

const meldungAus = async (antwort: Response): Promise<unknown> => {
  const inhalt = (await antwort.json().catch(() => null)) as {
    message?: string | string[];
  } | null;

  if (!antwort.ok) {
    const meldung = inhalt?.message;

    throw new Error(
      Array.isArray(meldung)
        ? meldung.join(' ')
        : (meldung ?? 'Das hat nicht geklappt.'),
    );
  }

  return inhalt;
};

export const PublicFormPage = () => {
  const { id = '' } = useParams();
  const [formular, setFormular] = useState<Formular | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  const [fertig, setFertig] = useState(false);
  const [werte, setWerte] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    message: '',
    website: '',
  });
  const [consent, setConsent] = useState(false);
  const nachweis = useArbeitsnachweis();
  const [prueft, setPrueft] = useState(false);

  const basis = `${API_ROOT}/public/forms/${encodeURIComponent(id)}`;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.body.classList.add('eingebettet');
  }, []);

  useEffect(() => {
    void fetch(basis)
      .then(meldungAus)
      .then((inhalt) => setFormular(inhalt as Formular))
      .catch((problem: Error) => setFehler(problem.message));
  }, [basis]);

  const feld = (key: keyof typeof werte) => ({
    id: `formular-${key}`,
    name: key,
    value: werte[key],
    onChange: (event: { target: { value: string } }) =>
      setWerte({ ...werte, [key]: event.target.value }),
  });

  const absenden = async (event: FormEvent) => {
    event.preventDefault();
    setFehler(null);
    setSendet(true);
    setPrueft(true);

    try {
      const kopf = await nachweis().finally(() => setPrueft(false));

      await meldungAus(
        await fetch(basis, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [NACHWEIS_KOPF]: kopf,
          },
          body: JSON.stringify({ ...werte, consent }),
        }),
      );
      setFertig(true);
    } catch (problem) {
      setFehler(problem instanceof Error ? problem.message : 'Fehler.');
    } finally {
      setSendet(false);
    }
  };

  if (formular === null) {
    return (
      <div className="public-form">
        {fehler === null ? (
          <p className="field__hint">Formular wird geladen…</p>
        ) : (
          <div className="error-banner">{fehler}</div>
        )}
      </div>
    );
  }

  if (fertig) {
    return (
      <div className="public-form">
        <div className="notice notice--positive" role="status">
          {formular.thankYou}
        </div>
      </div>
    );
  }

  return (
    <div className="public-form">
      <form className="public-form__form" onSubmit={(e) => void absenden(e)}>
        <h1>{formular.title}</h1>
        {formular.intro !== null && (
          <p className="public-form__intro">{formular.intro}</p>
        )}

        {fehler !== null && (
          <div className="error-banner" role="alert">
            {fehler}
          </div>
        )}

        <div className="public-form__row">
          <div className="field">
            <label htmlFor="formular-name">Name *</label>
            <input {...feld('name')} required autoComplete="name" />
          </div>
          <div className="field">
            <label htmlFor="formular-email">E-Mail *</label>
            <input
              {...feld('email')}
              type="email"
              required
              autoComplete="email"
            />
          </div>
        </div>
        <div className="public-form__row">
          <div className="field">
            <label htmlFor="formular-company">Firma</label>
            <input {...feld('company')} autoComplete="organization" />
          </div>
          <div className="field">
            <label htmlFor="formular-phone">Telefon</label>
            <input {...feld('phone')} type="tel" autoComplete="tel" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="formular-message">Nachricht</label>
          <textarea {...feld('message')} rows={5} />
        </div>

        <div className="public-form__trap" aria-hidden="true">
          <label htmlFor="formular-website">Website</label>
          <input {...feld('website')} tabIndex={-1} autoComplete="off" />
        </div>

        <label className="public-form__consent">
          <input
            type="checkbox"
            checked={consent}
            required
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>
            Ich bin einverstanden, dass {formular.company ?? 'der Empfänger'}{' '}
            meine Angaben speichert, um meine Anfrage zu bearbeiten.
            {formular.privacyUrl !== null && (
              <>
                {' '}
                <a
                  href={formular.privacyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Datenschutzerklärung
                </a>
              </>
            )}
          </span>
        </label>

        <button
          type="submit"
          className="button button--primary"
          disabled={sendet}
        >
          {prueft ? 'Wird geprüft …' : sendet ? 'Wird gesendet…' : 'Absenden'}
        </button>
      </form>
    </div>
  );
};

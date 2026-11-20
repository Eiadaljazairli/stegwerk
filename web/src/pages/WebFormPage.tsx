import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';

import { ObjectHeader } from '../components/ObjectHeader';
import { IconMail } from '../components/Icons';
import { LoadingAnnouncement } from '../components/Skeleton';
import { SAVE_WEB_FORM, WEB_FORM } from '../lib/queries';

type WebForm = {
  id: string;
  title: string;
  intro: string | null;
  thankYou: string;
  privacyUrl: string | null;
  createDeal: boolean;
  active: boolean;
};

type Entwurf = Omit<WebForm, 'id' | 'intro' | 'privacyUrl'> & {
  intro: string;
  privacyUrl: string;
};

const LEER: Entwurf = {
  title: 'Kontakt aufnehmen',
  intro: '',
  thankYou: 'Danke für Ihre Nachricht. Wir melden uns bald.',
  privacyUrl: '',
  createDeal: true,
  active: true,
};

export const WebFormPage = () => {
  const { data, loading, error } = useQuery<{ webForm: WebForm | null }>(
    WEB_FORM,
  );
  const [speichern, { loading: speichert, error: fehler }] = useMutation<{
    saveWebForm: WebForm;
  }>(SAVE_WEB_FORM, { refetchQueries: [WEB_FORM] });
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [kopiert, setKopiert] = useState(false);

  if (loading && data === undefined) {
    return <LoadingAnnouncement />;
  }

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  const form = data?.webForm ?? null;
  const wert: Entwurf =
    entwurf ??
    (form === null
      ? LEER
      : {
          ...form,
          intro: form.intro ?? '',
          privacyUrl: form.privacyUrl ?? '',
        });

  const setze = <K extends keyof Entwurf>(key: K, neu: Entwurf[K]) =>
    setEntwurf({ ...wert, [key]: neu });

  const sichern = async () => {
    await speichern({
      variables: {
        input: {
          title: wert.title,
          intro: wert.intro,
          thankYou: wert.thankYou,
          privacyUrl: wert.privacyUrl,
          createDeal: wert.createDeal,
          active: wert.active,
        },
      },
    })
      .then(() => setEntwurf(null))
      .catch(() => undefined);
  };

  const adresse =
    form === null ? null : `${window.location.origin}/formular/${form.id}`;
  const schnipsel =
    adresse === null
      ? null
      : `<iframe src="${adresse}" title="${wert.title.replace(/"/gu, '&quot;')}" style="width:100%;max-width:640px;height:640px;border:0" loading="lazy"></iframe>`;

  return (
    <>
      <ObjectHeader
        hilfe="webformular"
        kind="mailbox"
        icon={IconMail}
        label="Einstellungen"
        title="Webformular"
        note="Ein Kontaktformular für Ihre Website. Jede Anfrage wird zu Kontakt, Notiz und Aufgabe, auf Wunsch auch zu einem Geschäft in der ersten Phase."
        actions={
          <button
            type="button"
            className="button"
            disabled={(form !== null && entwurf === null) || speichert}
            onClick={() => void sichern()}
          >
            {form === null ? 'Formular anlegen' : 'Speichern'}
          </button>
        }
      />

      {fehler !== undefined && (
        <div className="error-banner">{fehler.message}</div>
      )}

      <section className="card web-form-settings">
        <div className="field">
          <label htmlFor="wf-title">Überschrift</label>
          <input
            id="wf-title"
            maxLength={120}
            value={wert.title}
            onChange={(event) => setze('title', event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="wf-intro">Einleitung (optional)</label>
          <textarea
            id="wf-intro"
            rows={2}
            maxLength={500}
            value={wert.intro}
            onChange={(event) => setze('intro', event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="wf-thanks">Text nach dem Absenden</label>
          <input
            id="wf-thanks"
            maxLength={500}
            value={wert.thankYou}
            onChange={(event) => setze('thankYou', event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="wf-privacy">Ihre Datenschutzerklärung</label>
          <input
            id="wf-privacy"
            type="url"
            placeholder="https://ihre-firma.de/datenschutz"
            value={wert.privacyUrl}
            onChange={(event) => setze('privacyUrl', event.target.value)}
          />
          <p className="field__hint">
            Wird neben der Einwilligung verlinkt. Das Formular speichert
            personenbezogene Daten; erwähnen Sie es dort.
          </p>
        </div>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={wert.createDeal}
            onChange={(event) => setze('createDeal', event.target.checked)}
          />
          Für jede Anfrage ein Geschäft anlegen
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={wert.active}
            onChange={(event) => setze('active', event.target.checked)}
          />
          Formular nimmt Anfragen an
        </label>
      </section>

      {adresse !== null && schnipsel !== null && (
        <section className="card web-form-settings">
          <h2>Auf Ihrer Website einbinden</h2>
          <p className="field__hint">
            Fügen Sie diesen Schnipsel dort ein, wo das Formular stehen soll.
            Oder verlinken Sie direkt:{' '}
            <a href={adresse} target="_blank" rel="noopener noreferrer">
              {adresse}
            </a>
          </p>
          <textarea
            className="web-form-settings__code"
            aria-label="Einbettungscode"
            readOnly
            rows={3}
            value={schnipsel}
            onFocus={(event) => event.target.select()}
          />
          <div>
            <button
              type="button"
              className="button button--ghost"
              onClick={() =>
                void navigator.clipboard
                  .writeText(schnipsel)
                  .then(() => setKopiert(true))
              }
            >
              {kopiert ? 'Kopiert' : 'Code kopieren'}
            </button>
          </div>
        </section>
      )}
    </>
  );
};

import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  CREATE_WEBHOOK,
  DELETE_WEBHOOK,
  SET_WEBHOOK_ACTIVE,
  TEST_WEBHOOK,
  WEBHOOK_EVENTS,
  WEBHOOKS,
} from '../lib/queries';

type Webhook = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastStatus: number | null;
  lastError: string | null;
  lastDeliveredAt: string | null;
  failureCount: number;
};

type Ereignis = { key: string; label: string };

const grund = (objekt: string, name: string): Ereignis[] => [
  { key: `${objekt}.created`, label: `${name} angelegt` },
  { key: `${objekt}.updated`, label: `${name} geändert` },
  { key: `${objekt}.deleted`, label: `${name} gelöscht` },
  { key: `${objekt}.restored`, label: `${name} wiederhergestellt` },
];

const BEGLEITBELEGE: Ereignis[] = [
  { key: 'order_confirmation.issued', label: 'Auftragsbestätigung gestellt' },
  {
    key: 'order_confirmation.cancelled',
    label: 'Auftragsbestätigung storniert',
  },
  { key: 'delivery_note.issued', label: 'Lieferschein gestellt' },
  { key: 'delivery_note.cancelled', label: 'Lieferschein storniert' },
];

const GRUPPEN: { titel: string; ereignisse: Ereignis[] }[] = [
  { titel: 'Firmen', ereignisse: grund('company', 'Firma') },
  { titel: 'Kontakte', ereignisse: grund('contact', 'Kontakt') },
  {
    titel: 'Geschäfte',
    ereignisse: [
      ...grund('deal', 'Geschäft'),
      { key: 'deal.stage_changed', label: 'Geschäft wechselt die Phase' },
      { key: 'deal.won', label: 'Geschäft gewonnen' },
      { key: 'deal.lost', label: 'Geschäft verloren' },
      { key: 'deal.contact_added', label: 'Kontakt kommt zu einem Geschäft' },
      {
        key: 'deal.contact_removed',
        label: 'Kontakt wird von einem Geschäft entfernt',
      },
    ],
  },
  { titel: 'Notizen', ereignisse: grund('note', 'Notiz') },
  { titel: 'Aufgaben', ereignisse: grund('task', 'Aufgabe') },
  { titel: 'Termine', ereignisse: grund('appointment', 'Termin') },
  {
    titel: 'Angebote',
    ereignisse: [
      ...grund('quote', 'Angebot'),
      { key: 'quote.accepted', label: 'Angebot angenommen' },
      { key: 'quote.declined', label: 'Angebot abgelehnt' },
    ],
  },
  {
    titel: 'Rechnungen',
    ereignisse: [
      ...grund('invoice', 'Rechnung'),
      { key: 'invoice.issued', label: 'Rechnung gestellt' },
      { key: 'invoice.paid', label: 'Rechnung bezahlt' },
    ],
  },
  {
    titel: 'Auftragsbestätigungen und Lieferscheine',
    ereignisse: BEGLEITBELEGE,
  },
];

const EREIGNISSE: Ereignis[] = GRUPPEN.flatMap((gruppe) => gruppe.ereignisse);

const zustand = (webhook: Webhook): string => {
  if (!webhook.active) {
    return webhook.failureCount >= 20
      ? 'Abgeschaltet nach 20 Fehlschlägen'
      : 'Pausiert';
  }

  if (webhook.lastDeliveredAt === null) {
    return 'Noch nichts zugestellt';
  }

  const wann = new Date(webhook.lastDeliveredAt).toLocaleString('de-DE');

  return webhook.lastError === null
    ? `Zuletzt zugestellt ${wann}`
    : `Fehler ${wann}: ${webhook.lastError}`;
};

export const WebhooksSection = () => {
  const { data } = useQuery<{ webhooks: Webhook[] }>(WEBHOOKS);
  const { data: erlaubtDaten } = useQuery<{ webhookEvents: string[] }>(
    WEBHOOK_EVENTS,
  );
  const erlaubt = new Set(erlaubtDaten?.webhookEvents ?? []);
  const gruppen = GRUPPEN.map((gruppe) => ({
    ...gruppe,
    ereignisse: gruppe.ereignisse.filter((ereignis) =>
      erlaubt.has(ereignis.key),
    ),
  })).filter((gruppe) => gruppe.ereignisse.length > 0);
  const refetchQueries = [{ query: WEBHOOKS }];
  const [anlegen, { loading }] = useMutation<{
    createWebhook: { secret: string };
  }>(CREATE_WEBHOOK, { refetchQueries });
  const [schalten] = useMutation(SET_WEBHOOK_ACTIVE, { refetchQueries });
  const [testen, { loading: testet }] = useMutation(TEST_WEBHOOK, {
    refetchQueries,
  });
  const [loeschen] = useMutation(DELETE_WEBHOOK, { refetchQueries });

  const [offen, setOffen] = useState(false);
  const [url, setUrl] = useState('');
  const [gewaehlt, setGewaehlt] = useState<string[]>(['deal.won']);
  const [geheimnis, setGeheimnis] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const fang = (problem: unknown) =>
    setFehler(problem instanceof Error ? problem.message : 'Fehler.');

  const webhooks = data?.webhooks ?? [];
  const auswahl = gewaehlt.filter((key) => erlaubt.has(key));

  return (
    <section className="detail-section webhooks">
      <div className="section-heading">
        <h2>Webhooks</h2>
        {!offen && geheimnis === null && (
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setOffen(true)}
          >
            Neuer Webhook
          </button>
        )}
      </div>
      <p className="field__hint">
        Aufbau der Nachricht und Prüfung der Signatur:{' '}
        <Link to="/entwickler/webhooks">Webhooks für Entwickler</Link>.
      </p>
      <p className="page__subtitle" style={{ marginTop: -4 }}>
        Stegwerk ruft eine Adresse auf, sobald etwas geschieht, zum Beispiel für
        Zapier, Make oder n8n. Jede Zustellung ist mit HMAC-SHA256 signiert
        (Kopfzeile X-Stegwerk-Signature über Zeitstempel und Inhalt). Ein
        Webhook liefert nur, was Sie selbst sehen dürfen; bei Änderungen steht
        dabei, welche Felder sich wie geändert haben.
      </p>

      {fehler !== null && <div className="error-banner">{fehler}</div>}

      {geheimnis !== null && (
        <div className="card webhooks__card">
          <p className="page__subtitle" style={{ marginTop: 0 }}>
            Das Geheimnis zum Prüfen der Signatur. Es steht nur jetzt hier;
            tragen Sie es beim Empfänger ein.
          </p>
          <code className="api-key__klartext">{geheimnis}</code>
          <div className="auth__actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="button"
              onClick={() => setGeheimnis(null)}
            >
              Erledigt
            </button>
          </div>
        </div>
      )}

      {offen && (
        <div className="card webhooks__card">
          <div className="field">
            <label htmlFor="webhook-url">Adresse (https)</label>
            <input
              id="webhook-url"
              value={url}
              placeholder="https://hooks.zapier.com/…"
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          {gruppen.length === 0 && (
            <p className="page__subtitle">
              Ihnen fehlt das Leserecht für alle Objekte, die ein Webhook melden
              kann.
            </p>
          )}
          {gruppen.map((gruppe) => (
            <fieldset key={gruppe.titel} className="role-editor__group">
              <legend>{gruppe.titel}</legend>
              {gruppe.ereignisse.map((ereignis) => (
                <label key={ereignis.key} className="role-editor__check">
                  <input
                    type="checkbox"
                    checked={gewaehlt.includes(ereignis.key)}
                    onChange={(event) =>
                      setGewaehlt(
                        event.target.checked
                          ? [...gewaehlt, ereignis.key]
                          : gewaehlt.filter((key) => key !== ereignis.key),
                      )
                    }
                  />
                  {ereignis.label}
                </label>
              ))}
            </fieldset>
          ))}
          <div className="role-editor__actions">
            <button
              type="button"
              className="button"
              disabled={loading || url.trim() === '' || auswahl.length === 0}
              onClick={() => {
                setFehler(null);
                void anlegen({
                  variables: { input: { url: url.trim(), events: auswahl } },
                })
                  .then((ergebnis) => {
                    setGeheimnis(ergebnis.data?.createWebhook.secret ?? null);
                    setOffen(false);
                    setUrl('');
                  })
                  .catch(fang);
              }}
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
          </div>
        </div>
      )}

      {webhooks.length > 0 && (
        <ul className="webhooks__list">
          {webhooks.map((webhook) => (
            <li key={webhook.id} className={webhook.active ? '' : 'is-muted'}>
              <div>
                <div className="webhooks__url">{webhook.url}</div>
                <div className="pagination__summary">
                  {webhook.events
                    .map(
                      (key) =>
                        EREIGNISSE.find((ereignis) => ereignis.key === key)
                          ?.label ?? key,
                    )
                    .join(', ')}
                </div>
                <div className="pagination__summary">{zustand(webhook)}</div>
              </div>
              <div className="webhooks__actions">
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={testet}
                  onClick={() =>
                    void testen({ variables: { id: webhook.id } }).catch(fang)
                  }
                >
                  Probe senden
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() =>
                    void schalten({
                      variables: { id: webhook.id, active: !webhook.active },
                    }).catch(fang)
                  }
                >
                  {webhook.active ? 'Pausieren' : 'Einschalten'}
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() =>
                    void loeschen({ variables: { id: webhook.id } }).catch(fang)
                  }
                >
                  Löschen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

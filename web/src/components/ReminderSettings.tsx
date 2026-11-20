import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';

import {
  MY_WORKSPACES,
  SET_BASE_INTEREST_RATE,
  SET_ERWAEHNUNG_MAIL,
  SET_TASK_DIGEST,
} from '../lib/queries';

type Membership = {
  id: string;
  taskDigest: boolean;
  erwaehnungMail: boolean;
  workspace: {
    id: string;
    name: string;
    baseInterestRatePercent: number | null;
  };
};

export const ReminderSettings = (): JSX.Element => {
  const { data, refetch } = useQuery<{ myWorkspaces: Membership[] }>(
    MY_WORKSPACES,
  );
  const [setRate, { loading: savingRate }] = useMutation(
    SET_BASE_INTEREST_RATE,
  );
  const [setDigest] = useMutation(SET_TASK_DIGEST);
  const [setErwaehnungMail] = useMutation(SET_ERWAEHNUNG_MAIL);

  const [rate, setRateInput] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);

  const membership = data?.myWorkspaces[0];

  useEffect(() => {
    if (membership === undefined) {
      return;
    }

    setRateInput(
      membership.workspace.baseInterestRatePercent === null
        ? ''
        : String(membership.workspace.baseInterestRatePercent),
    );
  }, [membership]);

  const speichern = async (): Promise<void> => {
    setFehler(null);
    setGespeichert(false);

    const getippt = rate.trim().replace(',', '.');

    try {
      await setRate({
        variables: {
          percent: getippt === '' ? null : Number(getippt),
        },
      });
      setGespeichert(true);
      await refetch();
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
      );
    }
  };

  return (
    <section className="card">
      <h2>Erinnerungen</h2>

      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}

      <div className="field field--wide">
        <label htmlFor="base-rate">Basiszinssatz nach §247 BGB</label>
        <div className="row-actions">
          <input
            id="base-rate"
            value={rate}
            inputMode="decimal"
            placeholder="z. B. 3,12"
            onChange={(event) => {
              setRateInput(event.target.value);
              setGespeichert(false);
            }}
          />
          <button
            type="button"
            className="button button--ghost"
            disabled={savingRate}
            onClick={() => void speichern()}
          >
            {savingRate ? 'Wird gespeichert…' : 'Speichern'}
          </button>
          {gespeichert && <span className="field__hint">Gespeichert.</span>}
        </div>
        <p className="field__hint">
          Grundlage für die Verzugszinsen auf Mahnungen. Er ändert sich zum 1.
          Januar und zum 1. Juli und wird von der Deutschen Bundesbank
          veröffentlicht. Leer lassen heißt: Mahnungen weisen keine Zinsen aus.
          Das ist die sichere Einstellung, denn ein geratener Satz stünde als
          Forderung in einem Brief.
        </p>
      </div>

      <div className="field field--wide">
        <label htmlFor="task-digest">
          <input
            id="task-digest"
            type="checkbox"
            checked={membership?.taskDigest ?? false}
            onChange={(event) => {
              void setDigest({
                variables: { enabled: event.target.checked },
              }).then(() => refetch());
            }}
          />{' '}
          Morgens an meine Aufgaben erinnern
        </label>
        <p className="field__hint">
          Eine Post am Tag, und nur dann, wenn etwas überfällig ist oder heute
          ansteht. Gilt nur für Sie selbst. Mahnungen an Kunden verschickt
          dieses Programm nie von allein.
        </p>
      </div>

      <div className="field field--wide">
        <label htmlFor="erwaehnung-mail">
          <input
            id="erwaehnung-mail"
            type="checkbox"
            checked={membership?.erwaehnungMail ?? false}
            onChange={(event) => {
              void setErwaehnungMail({
                variables: { enabled: event.target.checked },
              }).then(() => refetch());
            }}
          />{' '}
          Mail, wenn mich jemand erwähnt
        </label>
        <p className="field__hint">
          Erwähnungen mit @ in Notizen und Aufgaben stehen immer unter der
          Glocke oben. Die Mail nennt nur, wer Sie wo erwähnt hat, nicht den
          Text.
        </p>
      </div>
    </section>
  );
};

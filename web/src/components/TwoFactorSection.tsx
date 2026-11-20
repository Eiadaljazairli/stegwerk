import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';

import {
  BEGIN_TWO_FACTOR,
  CONFIRM_TWO_FACTOR,
  DISABLE_TWO_FACTOR,
  TWO_FACTOR_STATUS,
} from '../lib/queries';
import { AbhilfeLink } from './AbhilfeLink';

type Einrichtung = { secret: string; url: string; qrSvg: string };

export const TwoFactorSection = ({
  onCodesNotiert,
}: {
  onCodesNotiert?: () => void;
} = {}) => {
  const [fehler, setFehler] = useState<string | null>(null);
  const [einrichtung, setEinrichtung] = useState<Einrichtung | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [abschalten, setAbschalten] = useState(false);

  const { data, refetch } = useQuery<{
    twoFactorStatus: { enabled: boolean; recoveryCodesLeft: number };
  }>(TWO_FACTOR_STATUS);

  const [beginnen, { loading: beginnt }] = useMutation<{
    beginTwoFactorSetup: Einrichtung;
  }>(BEGIN_TWO_FACTOR);
  const [bestaetigen, { loading: bestaetigt }] = useMutation<{
    confirmTwoFactorSetup: string[];
  }>(CONFIRM_TWO_FACTOR);
  const [ausschalten, { loading: schaltetAus }] =
    useMutation(DISABLE_TWO_FACTOR);

  const aktiv = data?.twoFactorStatus.enabled === true;

  const melden = (problem: unknown): void => {
    setFehler(
      problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
    );
  };

  const starten = async (): Promise<void> => {
    setFehler(null);
    setCodes(null);

    try {
      const ergebnis = await beginnen();

      setEinrichtung(ergebnis.data?.beginTwoFactorSetup ?? null);
      setCode('');
    } catch (problem) {
      melden(problem);
    }
  };

  const einschalten = async (): Promise<void> => {
    setFehler(null);

    try {
      const ergebnis = await bestaetigen({ variables: { code } });

      setCodes(ergebnis.data?.confirmTwoFactorSetup ?? null);
      setEinrichtung(null);
      setCode('');
      await refetch();
    } catch (problem) {
      melden(problem);
    }
  };

  const beenden = async (): Promise<void> => {
    setFehler(null);

    try {
      await ausschalten({ variables: { code } });
      setAbschalten(false);
      setCode('');
      await refetch();
    } catch (problem) {
      melden(problem);
    }
  };

  return (
    <section className="card zwei-faktor">
      <h2>Zwei-Faktor-Anmeldung</h2>

      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
          <AbhilfeLink meldung={fehler} />
        </div>
      )}

      {codes !== null && (
        <div className="zwei-faktor__codes">
          <p>
            <strong>Bewahren Sie diese Codes auf.</strong> Jeder lässt Sie
            einmal herein, wenn Sie kein Telefon zur Hand haben. Sie werden
            nicht noch einmal angezeigt.
          </p>
          <ul>
            {codes.map((eintrag) => (
              <li key={eintrag}>{eintrag}</li>
            ))}
          </ul>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => {
              setCodes(null);
              onCodesNotiert?.();
            }}
          >
            Ich habe sie notiert
          </button>
        </div>
      )}

      {einrichtung !== null ? (
        <>
          <p className="field__hint">
            Scannen Sie den Code mit Ihrer Authentifizierungs-App und geben Sie
            anschließend die sechs Ziffern ein, die sie anzeigt.
          </p>

          <div
            className="zwei-faktor__qr"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: einrichtung.qrSvg }}
          />

          <p className="field__hint">
            Kein Scanner zur Hand? Tippen Sie diesen Schlüssel ein:
            <br />
            <code className="zwei-faktor__secret">{einrichtung.secret}</code>
          </p>

          <div className="field">
            <label htmlFor="totp-code">Code aus der App</label>
            <input
              id="totp-code"
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              onChange={(ereignis) => setCode(ereignis.target.value)}
            />
          </div>

          <div className="row-actions">
            <button
              type="button"
              className="button button--primary"
              disabled={bestaetigt || code.trim() === ''}
              onClick={() => void einschalten()}
            >
              Einschalten
            </button>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => {
                setEinrichtung(null);
                setCode('');
              }}
            >
              Abbrechen
            </button>
          </div>
        </>
      ) : aktiv ? (
        <>
          <p>
            Eingeschaltet. Bei jeder Anmeldung wird zusätzlich zum Passwort ein
            Code aus Ihrer App verlangt.
          </p>
          <p className="field__hint">
            Noch {data?.twoFactorStatus.recoveryCodesLeft ?? 0} von 10
            Wiederherstellungscodes offen.
          </p>

          {abschalten ? (
            <>
              <div className="field">
                <label htmlFor="totp-off">
                  Zum Abschalten einen Code eingeben
                </label>
                <input
                  id="totp-off"
                  value={code}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  onChange={(ereignis) => setCode(ereignis.target.value)}
                />
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="button button--danger"
                  disabled={schaltetAus || code.trim() === ''}
                  onClick={() => void beenden()}
                >
                  Abschalten
                </button>
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => {
                    setAbschalten(false);
                    setCode('');
                  }}
                >
                  Abbrechen
                </button>
              </div>
            </>
          ) : (
            <div className="row-actions">
              <button
                type="button"
                className="button button--quiet"
                onClick={() => setAbschalten(true)}
              >
                Abschalten
              </button>
              <button
                type="button"
                className="button button--quiet"
                disabled={beginnt}
                onClick={() => void starten()}
              >
                Neu einrichten
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="field__hint">
            Zusätzlich zum Passwort ein Code aus einer App auf Ihrem Telefon.
            Wer Ihr Passwort kennt, kommt damit trotzdem nicht herein.
          </p>
          <button
            type="button"
            className="button button--primary"
            disabled={beginnt}
            onClick={() => void starten()}
          >
            Einrichten
          </button>
        </>
      )}
    </section>
  );
};

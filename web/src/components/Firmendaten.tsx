import { useMutation } from '@apollo/client';
import { useEffect, useId, useState } from 'react';

import {
  hostVon,
  type ImpressumVorschau,
  leseQuelle,
  uebernahmeWerte,
  umschalten,
  vorauswahl,
} from '../lib/firmendaten';
import {
  FIRMENLOGO_ENTFERNEN,
  FIRMENLOGO_LADEN,
  IMPRESSUM_LESEN,
  IMPRESSUM_UEBERNEHMEN,
} from '../lib/queries';
import { Avatar } from './Avatar';
import { Dialogfenster } from './Dialogfenster';

const fehlerText = (problem: unknown): string =>
  problem instanceof Error ? problem.message : 'Das hat nicht geklappt.';

export const Firmendaten = ({
  firma,
  onChanged,
}: {
  firma: {
    id: string;
    name: string;
    website?: string | null;
    domain: string | null;
    logo?: string | null;
    logoQuelle?: string | null;
  };
  onChanged: () => void;
}) => {
  const [offen, setOffen] = useState(false);
  const [vorschau, setVorschau] = useState<ImpressumVorschau | null>(null);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [fehler, setFehler] = useState<string | null>(null);
  const [logoFehler, setLogoFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const ueberschrift = useId();
  const quelle = leseQuelle(firma.website, firma.domain);

  const [lesen, { loading: liest }] = useMutation<{
    impressumLesen: ImpressumVorschau;
  }>(IMPRESSUM_LESEN);
  const [uebernehmen, { loading: uebernimmt }] = useMutation(
    IMPRESSUM_UEBERNEHMEN,
  );
  const [logoLaden, { loading: laedtLogo }] = useMutation(FIRMENLOGO_LADEN);
  const [logoEntfernen, { loading: entferntLogo }] =
    useMutation(FIRMENLOGO_ENTFERNEN);

  const impressumHolen = () => {
    setVorschau(null);
    setFehler(null);
    setMeldung(null);
    lesen({ variables: { companyId: firma.id } })
      .then(({ data }) => {
        if (data !== undefined && data !== null) {
          setVorschau(data.impressumLesen);
          setAuswahl(vorauswahl(data.impressumLesen.felder));
        }
      })
      .catch((problem: unknown) => setFehler(fehlerText(problem)));
  };

  useEffect(() => {
    if (!offen || quelle === null) {
      return;
    }

    impressumHolen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offen]);

  const werte =
    vorschau === null ? [] : uebernahmeWerte(vorschau.felder, auswahl);

  const absenden = () => {
    setFehler(null);
    void uebernehmen({
      variables: { input: { companyId: firma.id, werte } },
    })
      .then(() => {
        onChanged();
        setOffen(false);
      })
      .catch((problem: unknown) => setFehler(fehlerText(problem)));
  };

  const logo = (laden: boolean) => {
    setLogoFehler(null);
    void (laden ? logoLaden : logoEntfernen)({
      variables: { companyId: firma.id },
    })
      .then(() => {
        setMeldung(laden ? 'Logo übernommen.' : 'Logo entfernt.');
        onChanged();
      })
      .catch((problem: unknown) => setLogoFehler(fehlerText(problem)));
  };

  return (
    <>
      <button
        type="button"
        className="button button--ghost"
        aria-haspopup="dialog"
        aria-expanded={offen}
        onClick={() => setOffen(true)}
      >
        Daten ergänzen
      </button>

      {offen && (
        <Dialogfenster
          titel="Firmendaten ergänzen"
          breit
          onClose={() => setOffen(false)}
        >
          {quelle === null ? (
            <p className="banner banner--warning">
              Tragen Sie zuerst die Website oder die Domain der Firma ein.
              Gelesen wird nur, was die Firma dort selbst veröffentlicht.
            </p>
          ) : (
            <>
              <p className="field__hint">
                Stegwerk liest das Impressum von <strong>{quelle}</strong> und
                übernimmt nur in Felder, die noch leer sind. Die Anfrage geht
                vom Stegwerk-Server direkt an diese Website, an niemanden sonst.
              </p>

              <section aria-labelledby={ueberschrift} aria-busy={liest}>
                <h3 id={ueberschrift} className="firmendaten__titel">
                  Aus dem Impressum
                </h3>

                {liest && (
                  <p className="state" role="status">
                    Website wird gelesen…
                  </p>
                )}

                {fehler !== null && (
                  <div className="error-banner" role="alert">
                    {fehler}
                  </div>
                )}

                {fehler !== null && vorschau === null && !liest && (
                  <div className="firmendaten__knoepfe">
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={impressumHolen}
                    >
                      Erneut lesen
                    </button>
                  </div>
                )}

                {vorschau !== null && vorschau.felder.length > 0 && (
                  <>
                    <ul className="firmendaten__liste">
                      {vorschau.felder.map((feld) => {
                        const id = `impressum-${feld.feld}`;

                        return (
                          <li key={feld.feld} className="firmendaten__zeile">
                            <input
                              id={id}
                              type="checkbox"
                              checked={
                                feld.uebernehmbar && auswahl.has(feld.feld)
                              }
                              disabled={!feld.uebernehmbar}
                              aria-describedby={
                                feld.grund === null ? undefined : `${id}-grund`
                              }
                              onChange={() =>
                                setAuswahl(umschalten(auswahl, feld.feld))
                              }
                            />
                            <label htmlFor={id}>
                              <span className="firmendaten__feld">
                                {feld.label}
                              </span>
                              <span className="firmendaten__wert">
                                {feld.wert}
                              </span>
                            </label>
                            {feld.grund !== null && (
                              <span
                                id={`${id}-grund`}
                                className="field__hint firmendaten__grund"
                              >
                                {feld.aktuell === null
                                  ? feld.grund
                                  : `Jetzt: ${feld.aktuell}. ${feld.grund}`}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <p className="field__hint">
                      Gelesen aus{' '}
                      <a
                        href={vorschau.quelle}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {vorschau.quelle}
                      </a>
                      . Bitte prüfen: ein Impressum ist von Menschen
                      geschrieben, und nicht jedes folgt dem üblichen Aufbau.
                    </p>
                    <div className="firmendaten__knoepfe">
                      <button
                        type="button"
                        className="button"
                        disabled={werte.length === 0 || uebernimmt}
                        onClick={absenden}
                      >
                        {uebernimmt
                          ? 'Wird übernommen…'
                          : werte.length === 1
                            ? '1 Feld übernehmen'
                            : `${String(werte.length)} Felder übernehmen`}
                      </button>
                    </div>
                  </>
                )}
              </section>

              <section aria-label="Logo" className="firmendaten__logo">
                <h3 className="firmendaten__titel">Logo</h3>
                <div className="firmendaten__logozeile">
                  <Avatar name={firma.name} size="lg" bild={firma.logo} />
                  <p className="field__hint">
                    {firma.logo != null
                      ? `Von ${hostVon(firma.logoQuelle) ?? quelle}. Wird einmal geholt und hier gespeichert.`
                      : 'Noch kein Logo; gezeigt werden die Initialen. Geholt wird das Symbol der Website (PNG, JPEG, GIF, WebP oder ICO bis 200 KB).'}
                  </p>
                </div>
                <div className="firmendaten__knoepfe">
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={laedtLogo || entferntLogo}
                    onClick={() => logo(true)}
                  >
                    {laedtLogo
                      ? 'Wird geholt…'
                      : firma.logo != null
                        ? 'Logo neu laden'
                        : 'Logo laden'}
                  </button>
                  {firma.logo != null && (
                    <button
                      type="button"
                      className="button button--ghost"
                      disabled={laedtLogo || entferntLogo}
                      onClick={() => logo(false)}
                    >
                      Logo entfernen
                    </button>
                  )}
                </div>
                {logoFehler !== null && (
                  <div className="error-banner" role="alert">
                    {logoFehler}
                  </div>
                )}
                {meldung !== null && (
                  <p className="field__hint" role="status">
                    {meldung}
                  </p>
                )}
              </section>
            </>
          )}
        </Dialogfenster>
      )}
    </>
  );
};

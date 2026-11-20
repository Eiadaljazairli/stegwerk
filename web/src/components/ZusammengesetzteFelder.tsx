import { type FormEvent, type ReactNode, useId, useRef, useState } from 'react';

import {
  ADRESS_TEILE,
  adresseZeilen,
  istAdresse,
  istLinkListe,
  linkAnzeige,
} from '../lib/feldformat';
import { ortErgaenzen, type PlzOrt, plzVollstaendig } from '../lib/plz';
import { type Adresse, type Link } from '../lib/types';
import { usePlzOrte } from '../lib/usePlz';
import { useFeldHinweis } from './FeldHinweis';
import { IconClose } from './Icons';

type FeldProps = {
  label: string;
  required?: boolean;
  value: unknown;
  hinweis?: string | null;
  onSave: (value: string) => void | Promise<unknown>;
};

const Kopf = ({
  label,
  required,
  knopf,
}: {
  label: string;
  required?: boolean;
  knopf?: ReactNode;
}) => (
  <div className="detail-field__label">
    {label}
    {required === true && <span className="detail-field__required">*</span>}
    {knopf}
  </div>
);

export const AdresseFeld = ({
  label,
  required,
  value,
  hinweis,
  onSave,
}: FeldProps) => {
  const id = useId();
  const adresse = istAdresse(value) ? value : null;
  const [entwurf, setEntwurf] = useState<Adresse | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [orte, setOrte] = useState<PlzOrt[]>([]);
  const feldHinweis = useFeldHinweis(label, hinweis, entwurf !== null);
  const plzOrte = usePlzOrte();
  const letzteFrage = useRef('');

  const plzGeaendert = (plz: string, land: string | undefined) => {
    letzteFrage.current = plz;

    if (!plzVollstaendig(plz)) {
      setOrte([]);

      return;
    }

    void plzOrte(plz, land).then((gefunden) => {
      if (letzteFrage.current !== plz) {
        return;
      }

      setOrte(gefunden);
      setEntwurf((jetzt) => {
        if (jetzt === null) {
          return jetzt;
        }

        const ergaenzung = ortErgaenzen(
          { ort: jetzt.ort ?? '', bundesland: jetzt.bundesland ?? '' },
          gefunden,
        );

        return ergaenzung === null ? jetzt : { ...jetzt, ...ergaenzung };
      });
    });
  };

  const speichern = async (event: FormEvent) => {
    event.preventDefault();

    if (entwurf === null) {
      return;
    }

    const sauber = Object.fromEntries(
      Object.entries(entwurf)
        .map(([teil, wert]) => [teil, (wert ?? '').trim()])
        .filter(([, wert]) => wert !== ''),
    );

    try {
      await onSave(
        Object.keys(sauber).length === 0 ? '' : JSON.stringify(sauber),
      );
      setEntwurf(null);
      setFehler(null);
    } catch (error) {
      setFehler((error as Error).message);
    }
  };

  if (entwurf !== null) {
    return (
      <form className="detail-field detail-field--wide" onSubmit={speichern}>
        <Kopf label={label} required={required} knopf={feldHinweis.knopf} />
        {feldHinweis.text}
        <div className="adresse-eingabe">
          {ADRESS_TEILE.map((teil) => (
            <div
              key={teil.key}
              className={`field adresse-eingabe__${teil.key}`}
            >
              <label htmlFor={`${id}-${teil.key}`}>{teil.label}</label>
              <input
                id={`${id}-${teil.key}`}
                value={entwurf[teil.key] ?? ''}
                maxLength={200}
                inputMode={teil.key === 'plz' ? 'numeric' : undefined}
                list={
                  teil.key === 'ort' && orte.length > 1
                    ? `${id}-orte`
                    : undefined
                }
                autoComplete={
                  {
                    strasse: 'address-line1',
                    zusatz: 'address-line2',
                    plz: 'postal-code',
                    ort: 'address-level2',
                    bundesland: 'address-level1',
                    land: 'country-name',
                  }[teil.key]
                }
                onChange={(event) => {
                  setEntwurf({ ...entwurf, [teil.key]: event.target.value });

                  if (teil.key === 'plz') {
                    plzGeaendert(event.target.value, entwurf.land);
                  }
                }}
              />
            </div>
          ))}
        </div>
        {orte.length > 1 && (
          <>
            <datalist id={`${id}-orte`}>
              {orte.map((eintrag) => (
                <option key={eintrag.ort} value={eintrag.ort} />
              ))}
            </datalist>
            <p className="field__hint">
              Zu dieser PLZ gehören mehrere Orte; das Ortsfeld schlägt sie vor.
            </p>
          </>
        )}
        {fehler !== null && <p className="field__error">{fehler}</p>}
        <div className="feld-aktionen">
          <button type="submit" className="button button--small">
            Speichern
          </button>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => {
              setEntwurf(null);
              setFehler(null);
            }}
          >
            Abbrechen
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="detail-field">
      <Kopf label={label} required={required} knopf={feldHinweis.knopf} />
      {feldHinweis.text}
      <button
        type="button"
        className="detail-field__value"
        aria-label={`${label} bearbeiten`}
        aria-describedby={feldHinweis.beschreibtId}
        onClick={() => {
          setOrte([]);
          setEntwurf(adresse ?? {});
        }}
      >
        {adresse === null ? (
          <span className="detail-field__empty">—</span>
        ) : (
          <span className="adresse-wert">
            {adresseZeilen(adresse).map((zeile) => (
              <span key={zeile}>{zeile}</span>
            ))}
          </span>
        )}
      </button>
    </div>
  );
};

export const LinksFeld = ({
  label,
  required,
  value,
  hinweis,
  onSave,
}: FeldProps) => {
  const id = useId();
  const links = istLinkListe(value) ? value : [];
  const [entwurf, setEntwurf] = useState<Link[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const feldHinweis = useFeldHinweis(label, hinweis, entwurf !== null);

  const speichern = async (event: FormEvent) => {
    event.preventDefault();

    if (entwurf === null) {
      return;
    }

    const sauber = entwurf
      .map((link) => ({
        url: link.url.trim(),
        ...(link.label !== undefined && link.label.trim() !== ''
          ? { label: link.label.trim() }
          : {}),
      }))
      .filter((link) => link.url !== '');

    try {
      await onSave(sauber.length === 0 ? '' : JSON.stringify(sauber));
      setEntwurf(null);
      setFehler(null);
    } catch (error) {
      setFehler((error as Error).message);
    }
  };

  if (entwurf !== null) {
    return (
      <form className="detail-field detail-field--wide" onSubmit={speichern}>
        <Kopf label={label} required={required} knopf={feldHinweis.knopf} />
        {feldHinweis.text}
        <ul className="links-eingabe">
          {entwurf.map((link, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <li key={index} className="links-eingabe__zeile">
              <label className="visually-hidden" htmlFor={`${id}-url-${index}`}>
                Adresse {index + 1}
              </label>
              <input
                id={`${id}-url-${index}`}
                inputMode="url"
                placeholder="linkedin.com/company/…"
                value={link.url}
                onChange={(event) =>
                  setEntwurf(
                    entwurf.map((eintrag, i) =>
                      i === index
                        ? { ...eintrag, url: event.target.value }
                        : eintrag,
                    ),
                  )
                }
              />
              <label
                className="visually-hidden"
                htmlFor={`${id}-label-${index}`}
              >
                Bezeichnung {index + 1}
              </label>
              <input
                id={`${id}-label-${index}`}
                placeholder="Bezeichnung"
                maxLength={100}
                value={link.label ?? ''}
                onChange={(event) =>
                  setEntwurf(
                    entwurf.map((eintrag, i) =>
                      i === index
                        ? { ...eintrag, label: event.target.value }
                        : eintrag,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="button button--ghost button--small"
                aria-label={`Link ${index + 1} entfernen`}
                onClick={() =>
                  setEntwurf(entwurf.filter((_, i) => i !== index))
                }
              >
                <IconClose size={14} />
              </button>
            </li>
          ))}
        </ul>
        {fehler !== null && <p className="field__error">{fehler}</p>}
        <div className="feld-aktionen">
          {entwurf.length < 10 && (
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => setEntwurf([...entwurf, { url: '' }])}
            >
              Link hinzufügen
            </button>
          )}
          <button type="submit" className="button button--small">
            Speichern
          </button>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => {
              setEntwurf(null);
              setFehler(null);
            }}
          >
            Abbrechen
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="detail-field">
      <Kopf label={label} required={required} knopf={feldHinweis.knopf} />
      {feldHinweis.text}
      <div
        className="detail-field__value detail-field__value--static"
        aria-describedby={feldHinweis.beschreibtId}
      >
        {links.length === 0 ? (
          <span className="detail-field__empty">—</span>
        ) : (
          <span className="link-liste">
            {links.map((link) => {
              const { text, ziel } = linkAnzeige(link);

              return ziel === null ? (
                <span key={link.url}>{text}</span>
              ) : (
                <a
                  key={link.url}
                  href={ziel}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {text}
                </a>
              );
            })}
          </span>
        )}
        <button
          type="button"
          className="link-button"
          aria-label={`${label} bearbeiten`}
          onClick={() =>
            setEntwurf(links.length === 0 ? [{ url: '' }] : [...links])
          }
        >
          Bearbeiten
        </button>
      </div>
    </div>
  );
};

import { useState } from 'react';

import {
  alsEingabe,
  artLabel,
  EMAIL_ARTEN,
  type Kontaktweg,
  TELEFON_ARTEN,
} from '../lib/kontaktwege';
import { formatTelefon, telLink } from '../lib/telefon';
import { type Feldrecht } from '../lib/useFeldrechte';

type Art = 'email' | 'telefon';

type Props = {
  haupt: { email: string | null; phone: string | null };
  weitereEmails: Kontaktweg[];
  weitereTelefone: Kontaktweg[];
  rechtEmail: Feldrecht;
  rechtTelefon: Feldrecht;
  onSave: (felder: {
    email?: string | null;
    phone?: string | null;
    weitereEmails?: { art: string; wert: string }[];
    weitereTelefone?: { art: string; wert: string }[];
  }) => Promise<unknown>;
};

const Liste = ({
  art,
  haupt,
  liste,
  nurLesen,
  onSave,
}: {
  art: Art;
  haupt: string | null;
  liste: Kontaktweg[];
  nurLesen: boolean;
  onSave: Props['onSave'];
}) => {
  const arten = art === 'email' ? EMAIL_ARTEN : TELEFON_ARTEN;
  const [neuArt, setNeuArt] = useState(arten[0].wert);
  const [neuWert, setNeuWert] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const titel =
    art === 'email' ? 'Weitere E-Mail-Adressen' : 'Weitere Telefonnummern';
  const feld = art === 'email' ? 'weitereEmails' : 'weitereTelefone';
  const hauptFeld = art === 'email' ? 'email' : 'phone';

  const speichern = (felder: Parameters<Props['onSave']>[0]) => {
    setFehler(null);

    return onSave(felder).catch((error: Error) => {
      setFehler(error.message);

      throw error;
    });
  };

  const entfernen = (index: number) =>
    void speichern({
      [feld]: alsEingabe(liste.filter((_, i) => i !== index)),
    }).catch(() => null);

  const zurHauptadresse = (index: number) => {
    const eintrag = liste[index];
    const rest = liste.filter((_, i) => i !== index);

    void speichern({
      [hauptFeld]: eintrag.wert,
      [feld]: alsEingabe([
        ...rest,
        ...(haupt === null || haupt === ''
          ? []
          : [{ art: 'arbeit', wert: haupt }]),
      ]),
    }).catch(() => null);
  };

  const hinzufuegen = () => {
    const wert = neuWert.trim();

    if (wert === '') {
      return;
    }

    void speichern({
      [feld]: alsEingabe([...liste, { art: neuArt, wert }]),
    })
      .then(() => setNeuWert(''))
      .catch(() => null);
  };

  return (
    <div className="kontaktwege__gruppe">
      <h3>{titel}</h3>

      {liste.length === 0 ? (
        <p className="kontaktwege__leer">Keine.</p>
      ) : (
        <ul className="kontaktwege__liste">
          {liste.map((eintrag, index) => (
            <li key={`${eintrag.art}-${eintrag.wert}`}>
              <span className="badge">{artLabel(eintrag.art)}</span>
              {art === 'email' ? (
                <a href={`mailto:${eintrag.wert}`}>{eintrag.wert}</a>
              ) : (
                <a href={telLink(eintrag.wert)}>
                  {formatTelefon(eintrag.wert)}
                </a>
              )}
              {eintrag.unzustellbarSeit != null && (
                <span
                  className="kontaktwege__warnung"
                  title={`Seit ${new Date(eintrag.unzustellbarSeit).toLocaleDateString('de-DE')}`}
                >
                  unzustellbar
                </span>
              )}
              {!nurLesen && (
                <span className="kontaktwege__aktionen">
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => zurHauptadresse(index)}
                  >
                    {art === 'email' ? 'Zur Hauptadresse' : 'Zur Hauptnummer'}
                  </button>
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    aria-label={`${eintrag.wert} entfernen`}
                    onClick={() => entfernen(index)}
                  >
                    Entfernen
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {!nurLesen && (
        <form
          className="kontaktwege__neu"
          onSubmit={(event) => {
            event.preventDefault();
            hinzufuegen();
          }}
        >
          <select
            aria-label={art === 'email' ? 'Art der Adresse' : 'Art der Nummer'}
            value={neuArt}
            onChange={(event) => setNeuArt(event.target.value)}
          >
            {arten.map((eintrag) => (
              <option key={eintrag.wert} value={eintrag.wert}>
                {eintrag.label}
              </option>
            ))}
          </select>
          <input
            type={art === 'email' ? 'email' : 'tel'}
            aria-label={
              art === 'email'
                ? 'Weitere E-Mail-Adresse'
                : 'Weitere Telefonnummer'
            }
            placeholder={art === 'email' ? 'name@beispiel.de' : '0171 1234567'}
            value={neuWert}
            maxLength={art === 'email' ? 320 : 40}
            onChange={(event) => setNeuWert(event.target.value)}
          />
          <button
            type="submit"
            className="button button--small"
            disabled={neuWert.trim() === ''}
          >
            Hinzufügen
          </button>
        </form>
      )}

      {fehler !== null && <div className="error-banner">{fehler}</div>}
    </div>
  );
};

export const Kontaktwege = ({
  haupt,
  weitereEmails,
  weitereTelefone,
  rechtEmail,
  rechtTelefon,
  onSave,
}: Props) => {
  if (rechtEmail === 'verborgen' && rechtTelefon === 'verborgen') {
    return null;
  }

  return (
    <section className="detail-section">
      <h2>Weitere Kontaktwege</h2>
      <div className="card kontaktwege">
        {rechtEmail !== 'verborgen' && (
          <Liste
            art="email"
            haupt={haupt.email}
            liste={weitereEmails}
            nurLesen={rechtEmail === 'lesen'}
            onSave={onSave}
          />
        )}
        {rechtTelefon !== 'verborgen' && (
          <Liste
            art="telefon"
            haupt={haupt.phone}
            liste={weitereTelefone}
            nurLesen={rechtTelefon === 'lesen'}
            onSave={onSave}
          />
        )}
      </div>
    </section>
  );
};

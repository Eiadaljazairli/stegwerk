import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { ankerAusHash } from '../components/Anker';
import { OeffentlicheSeite } from '../components/OeffentlicheSeite';
import { useAngemeldet } from '../lib/auth-kontext';
import {
  FEHLERBEHEBUNG_BESCHREIBUNG,
  FEHLERBEHEBUNG_TITEL,
  FEHLERFAELLE,
  fehlerfallPasst,
} from '../lib/fehlerbehebung';
import { IconArrowRight } from '../components/Icons';

export const FehlerbehebungPage = () => {
  const angemeldet = useAngemeldet();
  const [suche, setSuche] = useState('');
  const { hash } = useLocation();
  const treffer = FEHLERFAELLE.filter((fall) => fehlerfallPasst(fall, suche));

  useEffect(() => {
    const anker = ankerAusHash(hash);

    if (anker !== null) {
      document.getElementById(anker)?.scrollIntoView({ block: 'start' });
    }
  }, [hash]);

  return (
    <OeffentlicheSeite
      titel={FEHLERBEHEBUNG_TITEL}
      untertitel="Fehlerbehebung: Ursachen und was hilft"
      beschreibung={FEHLERBEHEBUNG_BESCHREIBUNG}
    >
      <p>
        Hier stehen die Fälle, die am häufigsten vorkommen, mit der Meldung, die
        Stegwerk dann zeigt. Wo in der App ein Fehler steht, führt „So beheben
        Sie das“ direkt zum passenden Abschnitt.
      </p>

      <div className="field">
        <label htmlFor="fehler-suche">Fehler suchen</label>
        <input
          id="fehler-suche"
          type="search"
          placeholder="etwa Postfach, Code oder Import"
          value={suche}
          onChange={(event) => setSuche(event.target.value)}
        />
      </div>
      <p className="field__hint" role="status" aria-live="polite">
        {suche.trim() === ''
          ? ''
          : treffer.length === 0
            ? `Nichts gefunden für „${suche.trim()}“.`
            : `${String(treffer.length)} ${treffer.length === 1 ? 'Fall' : 'Fälle'} gefunden.`}
      </p>

      <nav aria-label="Fälle" className="fehlerbehebung__inhalt">
        <ul className="legal-page__list">
          {treffer.map((fall) => (
            <li key={fall.id}>
              <a href={`#${fall.id}`}>{fall.titel}</a>
            </li>
          ))}
        </ul>
      </nav>

      {treffer.map((fall) => (
        <section
          key={fall.id}
          id={fall.id}
          className="fehlerbehebung__fall"
          aria-labelledby={`${fall.id}-titel`}
        >
          <h2 id={`${fall.id}-titel`}>{fall.titel}</h2>

          {fall.meldungen.length > 0 && (
            <>
              <h3>So steht es in Stegwerk</h3>
              <ul className="fehlerbehebung__meldungen">
                {fall.meldungen.map((meldung) => (
                  <li key={meldung}>
                    <q>{meldung}</q>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3>Woran es liegt</h3>
          <ul className="legal-page__list">
            {fall.ursachen.map((ursache) => (
              <li key={ursache}>{ursache}</li>
            ))}
          </ul>

          <h3>So beheben Sie das</h3>
          <ol className="legal-page__list">
            {fall.schritte.map((schritt) => (
              <li key={schritt}>{schritt}</li>
            ))}
          </ol>

          {'links' in fall &&
            (angemeldet || fall.id === 'anmeldung-gesperrt') && (
              <p className="hilfe__links">
                {fall.links.map((link) => (
                  <Link key={link.to} to={link.to}>
                    {link.label} <IconArrowRight size={14} />
                  </Link>
                ))}
              </p>
            )}
        </section>
      ))}

      <section>
        <h2>Nicht dabei?</h2>
        <p>
          {angemeldet ? (
            <>
              Das <Link to="/hilfe">Handbuch</Link> erklärt jede Funktion.{' '}
            </>
          ) : null}
          Hilft nichts davon, schreiben Sie uns über die Angaben unter{' '}
          <Link to="/kontakt">Kontakt</Link>. Nennen Sie dabei die Meldung im
          Wortlaut und auf welcher Seite sie stand.
        </p>
      </section>
    </OeffentlicheSeite>
  );
};

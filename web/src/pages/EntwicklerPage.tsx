import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';

import mcp from '../../../docs/mcp.md?raw';
import schnittstelle from '../../../docs/schnittstelle.md?raw';
import webformular from '../../../docs/webformular.md?raw';
import webhooks from '../../../docs/webhooks.md?raw';
import { ankerAusHash } from '../components/Anker';
import { DokuText } from '../components/DokuText';
import { OeffentlicheSeite } from '../components/OeffentlicheSeite';
import {
  ENTWICKLER_TEILE,
  entwicklerPfad,
  entwicklerTeil,
} from '../lib/entwickler';
import roheReferenz from '../lib/schema-referenz.json';
import {
  type Referenz,
  type ReferenzOperation,
  type ReferenzTyp,
  referenzSuche,
  signatur,
  typAnker,
  typTeile,
} from '../lib/schema-referenz';

const DOKU: Record<string, string> = {
  'schnittstelle.md': schnittstelle,
  'webhooks.md': webhooks,
  'mcp.md': mcp,
  'webformular.md': webformular,
};

const REFERENZ = roheReferenz as Referenz;
const TYPNAMEN = new Set(REFERENZ.typen.map((typ) => typ.name));

const KONTAKT_ANLEGEN = `curl -fsS https://ihre-adresse.de/graphql \\
  -H "Authorization: Bearer $STEGWERK_SCHLUESSEL" \\
  -H 'Content-Type: application/json' \\
  -d '{"query":"mutation($i:CreateContactInput!){createContact(input:$i){id firstName lastName}}",
       "variables":{"i":{"firstName":"Eva","lastName":"Berg","email":"eva@seewind.de"}}}'`;

const RECHNUNGEN_LESEN = `curl -fsS https://ihre-adresse.de/graphql \\
  -H "Authorization: Bearer $STEGWERK_SCHLUESSEL" \\
  -H 'Content-Type: application/json' \\
  -d '{"query":"{ invoices { id number status issuedAt totals { grossCents } company { name } } }"}'`;

const RECHNUNG_ALS_PDF = `curl -fsS https://ihre-adresse.de/invoices/<id>/pdf \\
  -H "Authorization: Bearer $STEGWERK_SCHLUESSEL" \\
  -o rechnung.pdf`;

const WEBHOOK_PRUEFEN = `# Geheimnis, Kopfzeile X-Stegwerk-Timestamp und der Rumpf, genau wie er ankam
printf '%s.%s' "$ZEITSTEMPEL" "$RUMPF" \\
  | openssl dgst -sha256 -hmac "$GEHEIMNIS" -hex \\
  | sed 's/^.* /sha256=/'
# Das Ergebnis muss gleich X-Stegwerk-Signature sein.`;

const Beispiel = ({ titel, code }: { titel: string; code: string }) => (
  <>
    <h3>{titel}</h3>
    <pre className="doku__code" tabIndex={0} aria-label={titel}>
      <code>{code}</code>
    </pre>
  </>
);

const Uebersicht = () => (
  <div className="doku">
    <p>
      Stegwerk hat eine GraphQL-Schnittstelle unter <code>/graphql</code>. Ein
      Programm meldet sich mit einem Schlüssel an, den ein Mitglied mit dem
      Recht „API-Schlüssel und Webhooks“ unter <strong>Team → Schlüssel</strong>{' '}
      anlegt. Der Schlüssel darf nie mehr als die Person, die ihn anlegt, und es
      gelten dieselben Rollen-, Feld- und Zeilenrechte wie in der Oberfläche.
    </p>

    <ul className="doku__teile">
      {ENTWICKLER_TEILE.filter((teil) => teil.slug !== '').map((teil) => (
        <li key={teil.slug}>
          <Link to={entwicklerPfad(teil.slug)}>{teil.titel}</Link>
          <span>{teil.beschreibung}</span>
        </li>
      ))}
    </ul>

    <h2 id="schnellstart">Schnellstart</h2>
    <p>
      Den Schlüssel in eine Umgebungsvariable legen, nicht in den Quelltext:{' '}
      <code>export STEGWERK_SCHLUESSEL=swk_…</code>. Statt{' '}
      <code>ihre-adresse.de</code> steht die Adresse, unter der Sie Stegwerk
      öffnen.
    </p>
    <Beispiel titel="Einen Kontakt anlegen" code={KONTAKT_ANLEGEN} />
    <Beispiel titel="Rechnungen lesen" code={RECHNUNGEN_LESEN} />
    <p>
      Beträge stehen in Cent (<code>grossCents</code>), damit keine Rundung
      dazwischenkommt.
    </p>
    <Beispiel titel="Eine Rechnung als PDF holen" code={RECHNUNG_ALS_PDF} />
    <Beispiel
      titel="Die Signatur eines Webhooks prüfen"
      code={WEBHOOK_PRUEFEN}
    />
    <p>
      Dasselbe in JavaScript, mit Prüfung des Zeitstempels, steht bei den{' '}
      <Link to="/entwickler/webhooks#signatur-pruefen">Webhooks</Link>.
    </p>

    <h2 id="grenzen">Grenzen</h2>
    <ul className="legal-page__list">
      <li>
        Eine Abfrage darf höchstens sechs Ebenen tief verschachtelt sein und
        höchstens 300 Felder abfragen.
      </li>
      <li>
        Höchstens 600 Anfragen je Minute von einer IP-Adresse; für das Anmelden
        und den MCP-Zugang gelten engere Grenzen.
      </li>
      <li>
        Die Mutationen für viele Datensätze auf einmal nehmen bis zu 100 Zeilen
        je Aufruf.
      </li>
      <li>Höchstens 25 gültige Schlüssel je Arbeitsbereich.</li>
    </ul>

    <h2 id="fehler">Fehler</h2>
    <p>
      Wie bei GraphQL üblich, steht ein Fehler im Feld <code>errors</code> der
      Antwort. <code>message</code> ist ein deutscher Satz, derselbe, den die
      Oberfläche zeigt, etwa „Der Schlüssel gilt nicht.“ oder „Dem Schlüssel …
      fehlt die Berechtigung, …“ mit dem Recht, das nötig wäre. Wurde ein
      Datensatz nicht gefunden, steht in <code>extensions.code</code> der Wert{' '}
      <code>NOT_FOUND</code>. Wer zu viele Anfragen schickt, bekommt „Zu viele
      Versuche in kurzer Zeit.“ und wartet eine Minute.
    </p>
  </div>
);

const TypName = ({ typ }: { typ: string }) => {
  const { vor, name, nach } = typTeile(typ);

  return (
    <>
      {vor}
      {TYPNAMEN.has(name) ? <a href={`#${typAnker(name)}`}>{name}</a> : name}
      {nach}
    </>
  );
};

const Operation = ({ op }: { op: ReferenzOperation }) => (
  <li className="referenz__eintrag" id={`op-${op.name}`}>
    <code className="referenz__signatur">
      <strong>{op.name}</strong>
      {op.argumente.length > 0 && (
        <>
          (
          {op.argumente.map((arg, nummer) => (
            <span key={arg.name}>
              {nummer > 0 && ', '}
              {arg.name}: <TypName typ={arg.typ} />
              {arg.vorgabe === undefined ? '' : ` = ${arg.vorgabe}`}
            </span>
          ))}
          )
        </>
      )}
      : <TypName typ={op.rueckgabe} />
    </code>
    {op.beschreibung !== undefined && <p>{op.beschreibung}</p>}
  </li>
);

const ART_NAME: Record<ReferenzTyp['art'], string> = {
  objekt: 'Typ',
  eingabe: 'Eingabe',
  aufzaehlung: 'Aufzählung',
  skalar: 'Skalar',
};

const Typ = ({ typ, offen }: { typ: ReferenzTyp; offen: boolean }) => (
  <details className="referenz__typ" id={typAnker(typ.name)} open={offen}>
    <summary>
      <code>{typ.name}</code>{' '}
      <span className="referenz__art">{ART_NAME[typ.art]}</span>
    </summary>
    {typ.beschreibung !== undefined && <p>{typ.beschreibung}</p>}
    {typ.felder !== undefined && (
      <ul className="referenz__felder">
        {typ.felder.map((feld) => (
          <li key={feld.name}>
            <code>
              {signatur({
                name: feld.name,
                argumente: feld.argumente,
                typ: '',
              }).replace(/: $/u, '')}
              : <TypName typ={feld.typ} />
            </code>
          </li>
        ))}
      </ul>
    )}
    {typ.werte !== undefined && (
      <p>
        <code>{typ.werte.join(' | ')}</code>
      </p>
    )}
  </details>
);

const SchemaReferenz = () => {
  const [suche, setSuche] = useState('');
  const { hash } = useLocation();
  const anker = ankerAusHash(hash);
  const treffer = referenzSuche(REFERENZ, suche);
  const anzahl =
    treffer.abfragen.length + treffer.aenderungen.length + treffer.typen.length;

  return (
    <div className="doku referenz">
      <p>
        Alle Abfragen und Mutationen, die ein Schlüssel aufrufen darf, erzeugt
        aus dem Schema dieser Fassung. Was ein Schlüssel nicht darf — Schlüssel
        und Webhooks verwalten, den zweiten Faktor, den Tarif —, steht nicht
        darin. Ob ein Aufruf durchgeht, entscheiden zusätzlich die Rechte des
        Schlüssels.
      </p>

      <div className="field">
        <label htmlFor="referenz-suche">In der Referenz suchen</label>
        <input
          id="referenz-suche"
          type="search"
          placeholder="etwa createContact, Invoice oder email"
          value={suche}
          onChange={(event) => setSuche(event.target.value)}
        />
      </div>
      <p className="field__hint" role="status" aria-live="polite">
        {suche.trim() === ''
          ? `${String(REFERENZ.abfragen.length)} Abfragen, ${String(REFERENZ.aenderungen.length)} Mutationen, ${String(REFERENZ.typen.length)} Typen.`
          : `${String(anzahl)} Treffer.`}
      </p>

      {treffer.abfragen.length > 0 && (
        <>
          <h2 id="abfragen">Abfragen</h2>
          <ul className="referenz__liste">
            {treffer.abfragen.map((op) => (
              <Operation key={op.name} op={op} />
            ))}
          </ul>
        </>
      )}

      {treffer.aenderungen.length > 0 && (
        <>
          <h2 id="mutationen">Mutationen</h2>
          <ul className="referenz__liste">
            {treffer.aenderungen.map((op) => (
              <Operation key={op.name} op={op} />
            ))}
          </ul>
        </>
      )}

      {treffer.typen.length > 0 && (
        <>
          <h2 id="typen">Typen</h2>
          {treffer.typen.map((typ) => (
            <Typ
              key={typ.name}
              typ={typ}
              offen={anker === typAnker(typ.name)}
            />
          ))}
        </>
      )}
    </div>
  );
};

export const EntwicklerPage = () => {
  const { teil: slug } = useParams();
  const { hash } = useLocation();
  const teil = entwicklerTeil(slug);

  useEffect(() => {
    const anker = ankerAusHash(hash);

    if (anker !== null) {
      document.getElementById(anker)?.scrollIntoView({ block: 'start' });
    }
  }, [hash, slug]);

  if (teil === null) {
    return <Navigate to="/entwickler" replace />;
  }

  return (
    <OeffentlicheSeite
      titel={teil.titel}
      untertitel={
        teil.slug === '' ? 'Schnittstelle, Webhooks und MCP' : undefined
      }
      beschreibung={teil.beschreibung}
    >
      <nav className="doku__reiter" aria-label="Entwickler-Doku">
        {ENTWICKLER_TEILE.map((eintrag) => (
          <Link
            key={eintrag.slug}
            to={entwicklerPfad(eintrag.slug)}
            aria-current={eintrag.slug === teil.slug ? 'page' : undefined}
          >
            {eintrag.slug === '' ? 'Übersicht' : eintrag.titel}
          </Link>
        ))}
      </nav>

      {teil.slug === '' ? (
        <Uebersicht />
      ) : teil.slug === 'referenz' ? (
        <SchemaReferenz />
      ) : (
        <DokuText quelle={DOKU[teil.datei ?? ''] ?? ''} />
      )}
    </OeffentlicheSeite>
  );
};

export default EntwicklerPage;

import { gql, useQuery } from '@apollo/client';
import { useState } from 'react';

import { scrollAttribute, useUeberlauf } from '../lib/useUeberlauf';
import { sicherheitsZusatz } from '../lib/protokollText';
import { usePermissions } from '../lib/usePermissions';

const MEIN_VERLAUF = gql`
  query MeinSicherheitsverlauf {
    meinSicherheitsverlauf {
      id
      art
      person
      handelnd
      geraet
      ipGekuerzt
      details
      wann
    }
  }
`;

const BEREICH = gql`
  query Sicherheitsprotokoll {
    sicherheitsprotokoll {
      id
      art
      person
      handelnd
      geraet
      ipGekuerzt
      details
      wann
    }
  }
`;

type Ereignis = {
  id: string;
  art: string;
  person: string | null;
  handelnd: string | null;
  geraet: string | null;
  ipGekuerzt: string | null;
  details: string | null;
  wann: string;
};

export const SICHERHEITS_TEXT: Record<string, string> = {
  anmeldung: 'Angemeldet',
  anmeldung_fehlgeschlagen: 'Anmeldung mit falschem Passwort',
  zweiter_faktor_falsch: 'Falscher Zwei-Faktor-Code',
  zwei_faktor_an: 'Zwei-Faktor-Anmeldung eingeschaltet',
  zwei_faktor_aus: 'Zwei-Faktor-Anmeldung ausgeschaltet',
  passwort_zurueckgesetzt: 'Passwort zurückgesetzt',
  passwort_geaendert: 'Passwort geändert',
  zwei_faktor_pflicht: 'Zwei-Faktor-Pflicht für das Team geändert',
  sitzung_beendet: 'Ein Gerät abgemeldet',
  andere_sitzungen_beendet: 'Alle anderen Geräte abgemeldet',
  einladung: 'Eingeladen',
  mitglied_entfernt: 'Aus dem Bereich entfernt',
  rolle_geaendert: 'Rolle geändert',
  schluessel_angelegt: 'API-Schlüssel angelegt',
  schluessel_widerrufen: 'API-Schlüssel widerrufen',
  schluessel_modus: 'API-Schlüssel umgestellt (direkt oder nur vorschlagen)',
  export: 'Liste exportiert',
  datenexport: 'Alle Daten exportiert',
  avv_angenommen: 'Auftragsverarbeitungsvertrag angenommen',
  email_geaendert: 'Anmelde-Adresse geändert',
  konto_geloescht: 'Konto gelöscht',
  zwei_faktor_zurueckgesetzt: 'Zwei-Faktor-Anmeldung zurückgesetzt',
  papierkorb_frist: 'Frist des Papierkorbs geändert',
  leerlauf_abmeldung: 'Abmelden nach Leerlauf geändert',
  einladungs_domains: 'Erlaubte Domains für Einladungen geändert',
  konto_gesperrt: 'Anmeldung nach Fehlversuchen gesperrt',
  mcp_verbunden: 'KI-Assistent verbunden',
  mcp_aenderung: 'KI-Assistent hat etwas geändert',
  mcp_vorschlag: 'KI-Assistent hat eine Änderung vorgeschlagen',
  ki_vorschlag_angenommen: 'Vorschlag der KI angenommen',
  ki_vorschlag_verworfen: 'Vorschlag der KI verworfen',
  automation_angelegt: 'Automation angelegt',
  automation_geaendert: 'Automation geändert',
  automation_geloescht: 'Automation gelöscht',
  automation_eingang_erneuert: 'Eingangsadresse einer Automation erneuert',
  buchhaltung_verbunden: 'Buchhaltung verbunden',
  buchhaltung_getrennt: 'Buchhaltung getrennt',
  buchhaltung_eingestellt: 'Einstellungen der Buchhaltung geändert',
  sso_verknuepft: 'Anmelden mit Google oder Microsoft eingerichtet',
  sso_getrennt: 'Anmelden mit Google oder Microsoft getrennt',
  ki_eingerichtet: 'KI eingerichtet oder geändert',
  ki_entfernt: 'KI entfernt',
  objekt_bezeichnung: 'Objekte umbenannt',
};

const WARNUNG = new Set([
  'anmeldung_fehlgeschlagen',
  'zweiter_faktor_falsch',
  'konto_gesperrt',
  'zwei_faktor_aus',
  'zwei_faktor_zurueckgesetzt',
  'email_geaendert',
  'datenexport',
  'sso_verknuepft',
]);

const ZEIT = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const zusatz = (e: Ereignis): string => sicherheitsZusatz(e.details);

const Liste = ({
  ereignisse,
  mitPerson,
}: {
  ereignisse: Ereignis[];
  mitPerson: boolean;
}) => {
  const [ref, laeuftUeber] = useUeberlauf<HTMLUListElement>();

  return ereignisse.length === 0 ? (
    <p className="field__hint">Noch keine Einträge.</p>
  ) : (
    <ul
      ref={ref}
      className="sicherheit__liste"
      {...scrollAttribute(laeuftUeber, 'Sicherheitsprotokoll', {
        istListe: true,
      })}
    >
      {ereignisse.map((e) => (
        <li
          key={e.id}
          className={WARNUNG.has(e.art) ? 'is-warnung' : undefined}
        >
          <div className="sicherheit__text">
            <strong>
              {SICHERHEITS_TEXT[e.art] ?? e.art}
              {mitPerson && e.person !== null && ` — ${e.person}`}
            </strong>
            <span className="field__hint">
              {[
                zusatz(e),
                e.handelnd === null ? null : `durch ${e.handelnd}`,
                e.geraet,
                e.ipGekuerzt === null ? null : `IP ${e.ipGekuerzt}`,
              ]
                .filter((t) => t !== null && t !== '')
                .join(' · ')}
            </span>
          </div>
          <time className="field__hint" dateTime={e.wann}>
            {ZEIT.format(new Date(e.wann))}
          </time>
        </li>
      ))}
    </ul>
  );
};

export const SicherheitSection = () => {
  const [sicht, setSicht] = useState<'mein' | 'bereich'>('mein');
  const mein = useQuery<{ meinSicherheitsverlauf: Ereignis[] }>(MEIN_VERLAUF, {
    fetchPolicy: 'cache-and-network',
  });
  const { can } = usePermissions();
  const bereich = useQuery<{ sicherheitsprotokoll: Ereignis[] }>(BEREICH, {
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    skip: !can('workspace:audit'),
  });
  const darfBereich =
    bereich.data?.sicherheitsprotokoll !== undefined &&
    bereich.error === undefined;

  return (
    <section className="card sicherheit">
      <div className="sicherheit__kopf">
        <h2>Sicherheitsprotokoll</h2>
        {darfBereich && (
          <div className="segmented" role="tablist" aria-label="Ansicht">
            <button
              type="button"
              role="tab"
              aria-selected={sicht === 'mein'}
              className={
                sicht === 'mein'
                  ? 'segmented__item is-active'
                  : 'segmented__item'
              }
              onClick={() => setSicht('mein')}
            >
              Mein Konto
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sicht === 'bereich'}
              className={
                sicht === 'bereich'
                  ? 'segmented__item is-active'
                  : 'segmented__item'
              }
              onClick={() => setSicht('bereich')}
            >
              Ganzer Bereich
            </button>
          </div>
        )}
      </div>
      <p className="field__hint">
        Anmeldungen, Fehlversuche und Änderungen am Zugang der letzten 12
        Monate. Rot markiert, was einen zweiten Blick verdient.
      </p>
      {sicht === 'bereich' && darfBereich ? (
        <Liste
          ereignisse={bereich.data?.sicherheitsprotokoll ?? []}
          mitPerson
        />
      ) : (
        <Liste
          ereignisse={mein.data?.meinSicherheitsverlauf ?? []}
          mitPerson={false}
        />
      )}
    </section>
  );
};

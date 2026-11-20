import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { IconCheck } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { LoadingAnnouncement } from '../components/Skeleton';
import { StatusTabs } from '../components/StatusTabs';
import { useToast } from '../components/Toast';
import {
  geaenderteFelder,
  leseStand,
  vorschlagZeilen,
  WERKZEUG_NAMEN,
  ZIEL_NAMEN,
} from '../lib/kiVorschlag';
import {
  KI_VORSCHLAG_ANNEHMEN,
  KI_VORSCHLAG_VERWERFEN,
  KI_VORSCHLAEGE,
  OFFENE_KI_VORSCHLAEGE,
  WORKSPACE_MEMBERS,
} from '../lib/queries';
import { useStageLabel } from '../lib/stages';
import { type DealStage, type Membership } from '../lib/types';
import { usePermissions } from '../lib/usePermissions';

type Vorschlag = {
  id: string;
  werkzeug: string;
  zusammenfassung: string;
  schluesselName: string;
  zielArt: string | null;
  zielId: string | null;
  zielName: string | null;
  zielPfad: string | null;
  vorher: string | null;
  nachher: string;
  status: 'offen' | 'angenommen' | 'verworfen';
  entschiedenVon: string | null;
  entschiedenAm: string | null;
  grund: string | null;
  fehler: string | null;
  ergebnisPfad: string | null;
  createdAt: string;
};

type Annahme = {
  kiVorschlagAnnehmen: {
    veraltet: boolean;
    aktuell: string | null;
    vorschlag: Vorschlag;
  };
};

const ZEIT = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const REITER = [
  { key: 'offen', label: 'Offen' },
  { key: 'angenommen', label: 'Angenommen' },
  { key: 'verworfen', label: 'Verworfen' },
] as const;

const Karte = ({
  vorschlag,
  auswahl,
  waehlen,
  veraltet,
  beschaeftigt,
  annehmen,
  verwerfen,
}: {
  vorschlag: Vorschlag;
  auswahl: boolean;
  waehlen: (an: boolean) => void;
  veraltet: Record<string, unknown> | null;
  beschaeftigt: boolean;
  annehmen: (trotzdem: boolean) => void;
  verwerfen: (grund: string) => void;
}) => {
  const stageLabel = useStageLabel();
  const { data: team } = useQuery<{ workspaceMembers: Membership[] }>(
    WORKSPACE_MEMBERS,
  );
  const [grundOffen, setGrundOffen] = useState(false);
  const [grund, setGrund] = useState('');
  const vorher = leseStand(vorschlag.vorher);
  const nachher = leseStand(vorschlag.nachher) ?? {};
  const hilfen = {
    phase: (stage: string) => stageLabel(stage.toUpperCase() as DealStage),
    name: (feld: string, id: string) => {
      if (feld !== 'assigneeId') {
        return null;
      }

      const person = team?.workspaceMembers.find((m) => m.user.id === id);

      return person === undefined
        ? null
        : `${person.user.firstName} ${person.user.lastName}`;
    },
  };
  const zeilen = vorschlagZeilen(vorher, nachher, hilfen);
  const jetzt =
    veraltet === null ? [] : vorschlagZeilen(veraltet, nachher, hilfen);
  const geaendert = new Set(geaenderteFelder(vorher, veraltet));
  const titelId = `ki-vorschlag-${vorschlag.id}`;

  return (
    <article className="card ki-vorschlag" aria-labelledby={titelId}>
      <div className="ki-vorschlag__kopf">
        {vorschlag.status === 'offen' && (
          <input
            type="checkbox"
            className="ki-vorschlag__wahl"
            aria-label={`„${vorschlag.zusammenfassung}“ auswählen`}
            checked={auswahl}
            onChange={(e) => waehlen(e.target.checked)}
          />
        )}
        <div>
          <h2 id={titelId} className="ki-vorschlag__titel">
            {vorschlag.zusammenfassung}
          </h2>
          <p className="field__hint">
            {WERKZEUG_NAMEN[vorschlag.werkzeug] ?? vorschlag.werkzeug}
            {vorschlag.zielArt !== null && (
              <>
                {' '}
                · {ZIEL_NAMEN[vorschlag.zielArt] ?? vorschlag.zielArt}{' '}
                {vorschlag.zielPfad === null ? (
                  (vorschlag.zielName ?? '')
                ) : (
                  <Link to={vorschlag.zielPfad}>
                    {vorschlag.zielName ?? 'öffnen'}
                  </Link>
                )}
              </>
            )}{' '}
            · vorgeschlagen von „{vorschlag.schluesselName}“ am{' '}
            <time dateTime={vorschlag.createdAt}>
              {ZEIT.format(new Date(vorschlag.createdAt))}
            </time>
          </p>
        </div>
      </div>

      <table className="table ki-vorschlag__tabelle">
        <caption className="visually-hidden">
          {vorher === null ? 'Was angelegt wird' : 'Was sich ändert'}
        </caption>
        <thead>
          <tr>
            <th scope="col">Feld</th>
            {vorher !== null && <th scope="col">Vorher</th>}
            <th scope="col">{vorher === null ? 'Wert' : 'Nachher'}</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((zeile) => (
            <tr
              key={zeile.feld}
              className={zeile.geaendert ? undefined : 'is-muted'}
            >
              <th scope="row">{zeile.label}</th>
              {vorher !== null && (
                <td className="ki-vorschlag__alt">{zeile.vorher}</td>
              )}
              <td className="ki-vorschlag__neu">{zeile.nachher}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {veraltet !== null && (
        <div className="banner banner--warning" role="alert">
          <p>
            Seit dem Vorschlag hat sich an der Akte etwas geändert. Jetzt steht
            dort:
          </p>
          <ul>
            {jetzt
              .filter((zeile) => geaendert.has(zeile.feld))
              .map((zeile) => (
                <li key={zeile.feld}>
                  {zeile.label}: {zeile.vorher}
                </li>
              ))}
          </ul>
          <p>Trotzdem annehmen überschreibt das mit dem Vorschlag.</p>
        </div>
      )}

      {vorschlag.fehler !== null && vorschlag.status === 'offen' && (
        <div className="error-banner" role="status">
          Zuletzt nicht angenommen: {vorschlag.fehler}
        </div>
      )}

      {vorschlag.status === 'offen' ? (
        <div className="row-actions">
          <button
            type="button"
            className="button"
            disabled={beschaeftigt}
            onClick={() => annehmen(veraltet !== null)}
          >
            {veraltet !== null ? 'Trotzdem annehmen' : 'Annehmen'}
          </button>
          {grundOffen ? (
            <>
              <label className="visually-hidden" htmlFor={`${titelId}-grund`}>
                Grund (freigestellt)
              </label>
              <input
                id={`${titelId}-grund`}
                maxLength={500}
                placeholder="Grund (freigestellt)"
                value={grund}
                onChange={(e) => setGrund(e.target.value)}
              />
              <button
                type="button"
                className="button button--danger"
                disabled={beschaeftigt}
                onClick={() => verwerfen(grund)}
              >
                Verwerfen
              </button>
              <button
                type="button"
                className="button button--quiet"
                onClick={() => setGrundOffen(false)}
              >
                Abbrechen
              </button>
            </>
          ) : (
            <button
              type="button"
              className="button button--ghost"
              disabled={beschaeftigt}
              onClick={() => setGrundOffen(true)}
            >
              Verwerfen…
            </button>
          )}
        </div>
      ) : (
        <p className="field__hint">
          {vorschlag.status === 'angenommen' ? 'Angenommen' : 'Verworfen'}
          {vorschlag.entschiedenVon === null
            ? ''
            : ` von ${vorschlag.entschiedenVon}`}
          {vorschlag.entschiedenAm === null
            ? ''
            : ` am ${ZEIT.format(new Date(vorschlag.entschiedenAm))}`}
          {vorschlag.grund === null ? '' : ` — „${vorschlag.grund}“`}
          {vorschlag.ergebnisPfad !== null && (
            <>
              {' · '}
              <Link to={vorschlag.ergebnisPfad}>
                {vorschlag.werkzeug === 'create_mail_draft'
                  ? 'Entwurf öffnen'
                  : 'Ansehen'}
              </Link>
            </>
          )}
        </p>
      )}
    </article>
  );
};

export const KiVorschlaegePage = () => {
  const rechte = usePermissions();
  const darf = rechte.can('workspace:ki');
  const { zeige } = useToast();
  const [reiter, setReiter] = useState<string>('offen');
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [veraltet, setVeraltet] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const { data, loading, error, refetch } = useQuery<{
    kiVorschlaege: Vorschlag[];
  }>(KI_VORSCHLAEGE, {
    variables: { status: ['offen', 'angenommen', 'verworfen'] },
    skip: !darf,
    fetchPolicy: 'cache-and-network',
  });
  const nachher = {
    refetchQueries: [OFFENE_KI_VORSCHLAEGE],
  };
  const [annehmenM] = useMutation<Annahme>(KI_VORSCHLAG_ANNEHMEN, nachher);
  const [verwerfenM] = useMutation(KI_VORSCHLAG_VERWERFEN, nachher);

  if (rechte.loading) {
    return <LoadingAnnouncement />;
  }

  if (!darf) {
    return (
      <div className="state">
        Vorschläge der KI sieht, wessen Rolle das Recht „Vorschläge der KI
        freigeben“ hat. Wenden Sie sich an eine Person mit Administratorrechten.
      </div>
    );
  }

  const alle = data?.kiVorschlaege ?? [];
  const gezeigt = alle.filter((v) => v.status === reiter);
  const offene = alle.filter((v) => v.status === 'offen');
  const gewaehlt = offene.filter((v) => auswahl.has(v.id));

  const meldung = (problem: unknown): string =>
    problem instanceof Error ? problem.message : 'Das ging nicht.';

  const annehmenEiner = async (
    vorschlag: Vorschlag,
    trotzdem: boolean,
  ): Promise<boolean> => {
    const antwort = await annehmenM({
      variables: { id: vorschlag.id, trotzdem },
    });
    const ergebnis = antwort.data?.kiVorschlagAnnehmen;

    if (ergebnis?.veraltet === true) {
      setVeraltet((bisher) => ({
        ...bisher,
        [vorschlag.id]: leseStand(ergebnis.aktuell) ?? {},
      }));

      return false;
    }

    setVeraltet(({ [vorschlag.id]: _weg, ...rest }) => rest);

    return true;
  };

  const annehmen = async (vorschlag: Vorschlag, trotzdem: boolean) => {
    setBeschaeftigt(true);
    setFehler(null);

    try {
      if (await annehmenEiner(vorschlag, trotzdem)) {
        zeige({ text: `„${vorschlag.zusammenfassung}“ angenommen.` });
      }
    } catch (problem) {
      setFehler(meldung(problem));
    } finally {
      setBeschaeftigt(false);
      await refetch().catch(() => null);
    }
  };

  const verwerfen = async (vorschlag: Vorschlag, grund: string) => {
    setBeschaeftigt(true);
    setFehler(null);

    try {
      await verwerfenM({ variables: { id: vorschlag.id, grund } });
      zeige({ text: `„${vorschlag.zusammenfassung}“ verworfen.` });
    } catch (problem) {
      setFehler(meldung(problem));
    } finally {
      setBeschaeftigt(false);
      await refetch().catch(() => null);
    }
  };

  const sammel = async (art: 'annehmen' | 'verwerfen') => {
    setBeschaeftigt(true);
    setFehler(null);

    let erledigt = 0;
    const probleme: string[] = [];

    for (const vorschlag of gewaehlt) {
      try {
        if (art === 'verwerfen') {
          await verwerfenM({ variables: { id: vorschlag.id } });
          erledigt += 1;
        } else if (await annehmenEiner(vorschlag, false)) {
          erledigt += 1;
        } else {
          probleme.push(
            `„${vorschlag.zusammenfassung}“: seit dem Vorschlag geändert`,
          );
        }
      } catch (problem) {
        probleme.push(`„${vorschlag.zusammenfassung}“: ${meldung(problem)}`);
      }
    }

    setAuswahl(new Set());
    setBeschaeftigt(false);
    zeige({
      text: `${String(erledigt)} ${erledigt === 1 ? 'Vorschlag' : 'Vorschläge'} ${art === 'annehmen' ? 'angenommen' : 'verworfen'}.`,
    });

    if (probleme.length > 0) {
      setFehler(probleme.join(' · '));
    }

    await refetch().catch(() => null);
  };

  return (
    <>
      <ObjectHeader
        hilfe="ki-vorschlaege"
        kind="data"
        icon={IconCheck}
        label="Vorschläge der KI"
        title={`${String(offene.length)} ${offene.length === 1 ? 'offener Vorschlag' : 'offene Vorschläge'}`}
        note="Ein KI-Assistent mit einem Schlüssel im Modus „nur vorschlagen“ ändert nichts selbst. Was er ändern würde, steht hier; angenommen wird mit Ihren Rechten."
      />

      <StatusTabs
        tabs={REITER.map((r) => ({
          key: r.key,
          label: r.label,
          count: alle.filter((v) => v.status === r.key).length,
        }))}
        active={reiter}
        onChange={setReiter}
      />

      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}
      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}

      {reiter === 'offen' && offene.length > 0 && (
        <div
          className="ki-vorschlaege__sammel"
          role="group"
          aria-label="Sammelaktion"
        >
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={gewaehlt.length === offene.length}
              onChange={(e) =>
                setAuswahl(
                  e.target.checked
                    ? new Set(offene.map((v) => v.id))
                    : new Set(),
                )
              }
            />
            Alle auswählen
          </label>
          <button
            type="button"
            className="button"
            disabled={beschaeftigt || gewaehlt.length === 0}
            onClick={() => void sammel('annehmen')}
          >
            {gewaehlt.length} annehmen
          </button>
          <button
            type="button"
            className="button button--ghost"
            disabled={beschaeftigt || gewaehlt.length === 0}
            onClick={() => void sammel('verwerfen')}
          >
            {gewaehlt.length} verwerfen
          </button>
        </div>
      )}

      {loading && data === undefined ? (
        <LoadingAnnouncement />
      ) : gezeigt.length === 0 ? (
        <div className="state">
          {reiter === 'offen'
            ? 'Keine offenen Vorschläge. Wie ein Assistent Vorschläge macht, steht in der Hilfe.'
            : 'Hier steht noch nichts.'}
        </div>
      ) : (
        <div className="ki-vorschlaege">
          {gezeigt.map((vorschlag) => (
            <Karte
              key={vorschlag.id}
              vorschlag={vorschlag}
              auswahl={auswahl.has(vorschlag.id)}
              waehlen={(an) =>
                setAuswahl((bisher) => {
                  const neu = new Set(bisher);

                  if (an) {
                    neu.add(vorschlag.id);
                  } else {
                    neu.delete(vorschlag.id);
                  }

                  return neu;
                })
              }
              veraltet={veraltet[vorschlag.id] ?? null}
              beschaeftigt={beschaeftigt}
              annehmen={(trotzdem) => void annehmen(vorschlag, trotzdem)}
              verwerfen={(grund) => void verwerfen(vorschlag, grund)}
            />
          ))}
        </div>
      )}
    </>
  );
};

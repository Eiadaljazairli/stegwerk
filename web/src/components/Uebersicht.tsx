import { type ApolloError, useMutation, useQuery } from '@apollo/client';
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';

import { balkenLink } from '../lib/kachelLink';
import {
  ersteGruppe,
  GRUPPEN,
  gruppenFuer,
  hatBetrag,
  hatEigeneFelder,
  hatVerantwortlichen,
  INVOICE_STATUS,
  type Objekt,
  OBJEKTE,
} from '../lib/kachelObjekte';
import {
  CUSTOM_FIELDS,
  DASHBOARD_KACHELN_SPEICHERN,
  KACHELN_WERTE,
  MEINE_UEBERSICHT,
  MY_OPEN_TASKS,
  PIPELINE_NACH_PHASE,
  UEBERSICHT_SPEICHERN,
  UEBERSICHT_ZURUECKSETZEN,
} from '../lib/queries';
import { usePhasen, usePipelines } from '../lib/stages';
import { formatCurrency, type Task } from '../lib/types';
import { type FeldArt, useFeldrechte } from '../lib/useFeldrechte';
import { ForecastChart } from './ForecastChart';
import { PipelineChart, type PipelineStage } from './PipelineChart';
import { SkeletonMetrics } from './Skeleton';
import { TaskList } from './TaskList';
import { IconArrowDown, IconArrowUp, IconClose } from './Icons';

export type Kachel = {
  id: string;
  typ: KachelTyp;
  titel: string | null;
  objekt: Objekt | null;
  mass: Mass | null;
  gruppe: string | null;
  status: string | null;
  pipelineId: string | null;
  nurMeine: boolean;
  zeitraum: string | null;
  liste: string | null;
};

type KachelTyp =
  | 'kennzahl'
  | 'balken'
  | 'liste'
  | 'pipeline'
  | 'prognose'
  | 'aufgaben';
type Mass = 'anzahl' | 'summe' | 'durchschnitt';

type Ergebnis = {
  gesperrt: boolean;
  hinweis: string | null;
  betraegeVerborgen: boolean;
  anzahl: number | null;
  wert: number | null;
  balken: {
    schluessel: string;
    label: string;
    farbe: string | null;
    anzahl: number;
    wert: number | null;
  }[];
  eintraege: {
    id: string;
    titel: string;
    zusatz: string | null;
    link: string;
  }[];
};

export const MAX_KACHELN = 24;

const TYPEN: { wert: KachelTyp; label: string }[] = [
  { wert: 'kennzahl', label: 'Kennzahl' },
  { wert: 'balken', label: 'Balken' },
  { wert: 'liste', label: 'Liste' },
  { wert: 'pipeline', label: 'Pipeline nach Phase' },
  { wert: 'prognose', label: 'Prognose' },
  { wert: 'aufgaben', label: 'Meine offenen Aufgaben' },
];

const LISTEN: { wert: string; label: string }[] = [
  { wert: 'ruhend', label: 'Ruhende Geschäfte' },
  { wert: 'neueGeschaefte', label: 'Neue Geschäfte' },
  { wert: 'gewonnen', label: 'Zuletzt gewonnen' },
  { wert: 'neueFirmen', label: 'Neue Firmen' },
  { wert: 'neueKontakte', label: 'Neue Kontakte' },
];

const ZEITRAEUME: { wert: string; label: string }[] = [
  { wert: 'alle', label: 'Gesamt' },
  { wert: '30', label: 'Letzte 30 Tage' },
  { wert: '90', label: 'Letzte 90 Tage' },
  { wert: '365', label: 'Letzte 12 Monate' },
  { wert: 'jahr', label: 'Dieses Jahr' },
];

const DEAL_STATUS: { wert: string; label: string }[] = [
  { wert: 'alle', label: 'Alle' },
  { wert: 'offen', label: 'Offen' },
  { wert: 'gewonnen', label: 'Gewonnen' },
  { wert: 'verloren', label: 'Verloren' },
  { wert: 'ruhend', label: 'Ruhend' },
];

const TASK_STATUS: { wert: string; label: string }[] = [
  { wert: 'alle', label: 'Alle' },
  { wert: 'offen', label: 'Offen' },
  { wert: 'ueberfaellig', label: 'Überfällig' },
  { wert: 'erledigt', label: 'Erledigt' },
];

const LINK_JE_OBJEKT: Record<Objekt, string> = {
  deal: '/geschaefte',
  company: '/firmen',
  contact: '/kontakte',
  task: '/aufgaben',
  invoice: '/rechnungen',
};

const alsEingabe = (kachel: Kachel) => ({
  id: kachel.id,
  typ: kachel.typ,
  titel: kachel.titel,
  objekt: kachel.objekt,
  mass: kachel.mass,
  gruppe: kachel.gruppe,
  status: kachel.status,
  pipelineId: kachel.pipelineId,
  nurMeine: kachel.nurMeine,
  zeitraum: kachel.zeitraum,
  liste: kachel.liste,
});

export const titelVon = (kachel: Kachel): string => {
  if (kachel.titel !== null && kachel.titel !== '') {
    return kachel.titel;
  }

  const objekt =
    OBJEKTE.find((eintrag) => eintrag.wert === kachel.objekt)?.plural ?? '';

  switch (kachel.typ) {
    case 'kennzahl':
      if (kachel.objekt === 'invoice' && kachel.mass === 'summe') {
        return 'Umsatz netto';
      }

      return kachel.mass === 'summe'
        ? `Summe ${objekt}`
        : kachel.mass === 'durchschnitt'
          ? `Ø Betrag ${objekt}`
          : objekt;
    case 'balken': {
      const gruppe =
        GRUPPEN.find((eintrag) => eintrag.wert === kachel.gruppe)?.label ??
        'Feld';

      return kachel.objekt === 'invoice' && kachel.mass === 'summe'
        ? `Umsatz nach ${gruppe}`
        : `${objekt} nach ${gruppe}`;
    }
    case 'liste':
      return (
        LISTEN.find((eintrag) => eintrag.wert === kachel.liste)?.label ??
        'Liste'
      );
    default:
      return TYPEN.find((eintrag) => eintrag.wert === kachel.typ)?.label ?? '';
  }
};

const MIT_WERTEN = new Set(['kennzahl', 'balken', 'liste']);

const schluesselVon = (kachel: Kachel): string =>
  JSON.stringify(alsEingabe(kachel));

type Werte = { werte: Map<string, Ergebnis>; error?: ApolloError };

const WerteKontext = createContext<Werte>({ werte: new Map() });

const useAlleKachelWerte = (kacheln: Kachel[]): Werte => {
  const eingaben = kacheln
    .filter((kachel) => MIT_WERTEN.has(kachel.typ))
    .sort((a, b) => a.id.localeCompare(b.id));
  const schluessel = eingaben.map(schluesselVon);
  const { data, error } = useQuery<{ kachelnWerte: Ergebnis[] }>(
    KACHELN_WERTE,
    {
      variables: { kacheln: eingaben.map(alsEingabe) },
      skip: eingaben.length === 0,
      fetchPolicy: 'cache-and-network',
    },
  );
  const zuletzt = useRef(new Map<string, Ergebnis>());

  const werte = useMemo(() => {
    if (data === undefined) {
      return zuletzt.current;
    }

    return new Map(
      schluessel.flatMap((eintrag, stelle) => {
        const ergebnis = data.kachelnWerte[stelle];

        return ergebnis === undefined
          ? []
          : [[eintrag, ergebnis] as [string, Ergebnis]];
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, schluessel.join('|')]);

  useEffect(() => {
    zuletzt.current = werte;
  }, [werte]);

  return { werte, error };
};

const useKachelWerte = (
  kachel: Kachel,
): { data?: { kachelWerte: Ergebnis }; error?: ApolloError } => {
  const { werte, error } = useContext(WerteKontext);
  const ergebnis = werte.get(schluesselVon(kachel));

  return {
    data: ergebnis === undefined ? undefined : { kachelWerte: ergebnis },
    error: ergebnis === undefined ? error : undefined,
  };
};

const geld = (wert: number | null): string =>
  wert === null ? '—' : formatCurrency(wert);

const KennzahlKachel = ({
  kachel,
  bearbeiten,
}: {
  kachel: Kachel;
  bearbeiten: boolean;
}) => {
  const { data, error } = useKachelWerte(kachel);
  const ergebnis = data?.kachelWerte;
  const mitBetrag = kachel.mass === 'summe' || kachel.mass === 'durchschnitt';
  const wert =
    ergebnis === undefined
      ? '…'
      : ergebnis.gesperrt || error !== undefined
        ? '—'
        : mitBetrag
          ? geld(ergebnis.wert)
          : String(ergebnis.anzahl ?? 0);
  const alarm =
    (kachel.status === 'ueberfaellig' || kachel.status === 'ruhend') &&
    (ergebnis?.anzahl ?? 0) > 0;
  const klasse = alarm ? 'card metric is-alarming' : 'card metric';
  const hinweis =
    ergebnis?.hinweis ??
    (ergebnis?.betraegeVerborgen === true && mitBetrag
      ? 'Beträge sind für Ihre Rolle verborgen.'
      : undefined);
  const inhalt = (
    <>
      <div className="metric__label">{titelVon(kachel)}</div>
      <div className="metric__value" title={hinweis}>
        {wert}
      </div>
    </>
  );

  if (bearbeiten || kachel.objekt === null || ergebnis?.gesperrt === true) {
    return <div className={klasse}>{inhalt}</div>;
  }

  const ziel =
    kachel.objekt === 'deal' && kachel.status === 'ruhend'
      ? '/geschaefte?ruhend'
      : LINK_JE_OBJEKT[kachel.objekt];

  return (
    <Link to={ziel} className={klasse}>
      {inhalt}
    </Link>
  );
};

const BalkenKachel = ({
  kachel,
  bearbeiten,
}: {
  kachel: Kachel;
  bearbeiten: boolean;
}) => {
  const { data, error } = useKachelWerte(kachel);
  const ergebnis = data?.kachelWerte;
  const pipelines = usePipelines();

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  if (ergebnis === undefined) {
    return <div className="card funnel kachel__leer">Wird geladen…</div>;
  }

  if (ergebnis.gesperrt) {
    return (
      <div className="card funnel kachel__leer">
        {ergebnis.hinweis ?? 'Nicht verfügbar.'}
      </div>
    );
  }

  const mitBetrag =
    (kachel.mass === 'summe' || kachel.mass === 'durchschnitt') &&
    !ergebnis.betraegeVerborgen;
  const mass = (eintrag: Ergebnis['balken'][number]) =>
    mitBetrag ? (eintrag.wert ?? 0) : eintrag.anzahl;
  const groesster = Math.max(...ergebnis.balken.map(mass), 1);
  const zahl = (eintrag: Ergebnis['balken'][number]) =>
    mitBetrag ? geld(eintrag.wert) : String(eintrag.anzahl);

  if (ergebnis.balken.length === 0 || ergebnis.anzahl === 0) {
    return (
      <div className="card funnel kachel__leer">Noch nichts zu zählen.</div>
    );
  }

  return (
    <div className="card funnel">
      {ergebnis.betraegeVerborgen && kachel.mass !== 'anzahl' && (
        <p className="kachel__hinweis">
          Beträge sind für Ihre Rolle verborgen; gezählt wird die Anzahl.
        </p>
      )}
      {ergebnis.balken.map((eintrag) => {
        const beschreibung = `${eintrag.label}: ${String(eintrag.anzahl)}${mitBetrag ? ` · ${geld(eintrag.wert)}` : ''}`;
        const ziel = bearbeiten
          ? null
          : balkenLink(
              kachel,
              eintrag.schluessel,
              new Date(),
              pipelines.length,
            );
        const inhalt = (
          <>
            <div className="funnel__label">
              <span className="funnel__name">
                {eintrag.farbe !== null && (
                  <span
                    className={`phase-punkt phase--${eintrag.farbe}`}
                    aria-hidden="true"
                  />
                )}
                {eintrag.label}
              </span>
              {mitBetrag && (
                <span className="funnel__count">
                  {eintrag.anzahl === 1
                    ? '1 Eintrag'
                    : `${String(eintrag.anzahl)} Einträge`}
                </span>
              )}
            </div>
            <div className="funnel__track" aria-hidden="true">
              <div
                className="funnel__bar"
                style={{
                  width: `${String(Math.max((mass(eintrag) / groesster) * 100, mass(eintrag) > 0 ? 2 : 0))}%`,
                }}
              />
            </div>
            <div className="funnel__amount">{zahl(eintrag)}</div>
          </>
        );

        return ziel === null ? (
          <div
            className="funnel__row"
            key={eintrag.schluessel}
            title={beschreibung}
          >
            {inhalt}
          </div>
        ) : (
          <Link
            className="funnel__row funnel__row--link"
            key={eintrag.schluessel}
            to={ziel}
            title={`${beschreibung} – in der Liste öffnen`}
          >
            {inhalt}
          </Link>
        );
      })}
      <table className="visually-hidden">
        <caption>{titelVon(kachel)}</caption>
        <thead>
          <tr>
            <th scope="col">Gruppe</th>
            <th scope="col">Anzahl</th>
            {mitBetrag && <th scope="col">Betrag</th>}
          </tr>
        </thead>
        <tbody>
          {ergebnis.balken.map((eintrag) => (
            <tr key={eintrag.schluessel}>
              <th scope="row">{eintrag.label}</th>
              <td>{eintrag.anzahl}</td>
              {mitBetrag && <td>{geld(eintrag.wert)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ListeKachel = ({ kachel }: { kachel: Kachel }) => {
  const { data, error } = useKachelWerte(kachel);
  const ergebnis = data?.kachelWerte;

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  if (ergebnis === undefined) {
    return <div className="card kachel__leer">Wird geladen…</div>;
  }

  if (ergebnis.gesperrt) {
    return (
      <div className="card kachel__leer">
        {ergebnis.hinweis ?? 'Nicht verfügbar.'}
      </div>
    );
  }

  if (ergebnis.eintraege.length === 0) {
    return <div className="card kachel__leer">Nichts dabei.</div>;
  }

  return (
    <ul className="card kachel-liste">
      {ergebnis.eintraege.map((eintrag) => (
        <li key={eintrag.id}>
          <Link to={eintrag.link}>{eintrag.titel}</Link>
          {eintrag.zusatz !== null && eintrag.zusatz !== '' && (
            <span className="kachel-liste__zusatz">{eintrag.zusatz}</span>
          )}
        </li>
      ))}
    </ul>
  );
};

const PipelineKachel = ({ kachel }: { kachel: Kachel }) => {
  const feldrechte = useFeldrechte();
  const { data } = useQuery<{ pipeline: PipelineStage[] }>(
    PIPELINE_NACH_PHASE,
    { variables: { pipelineId: kachel.pipelineId } },
  );

  return (
    <PipelineChart
      stages={data?.pipeline ?? []}
      pipelineId={kachel.pipelineId}
      betraegeVerborgen={feldrechte.standard('deal', 'amount') === 'verborgen'}
    />
  );
};

const AufgabenKachel = () => {
  const { data, refetch } = useQuery<{ myOpenTasks: Task[] }>(MY_OPEN_TASKS, {
    variables: { limit: 8 },
  });

  return (
    <TaskList
      tasks={data?.myOpenTasks ?? []}
      onChanged={() => void refetch()}
      emptyMessage="Nichts offen. Gut gemacht."
    />
  );
};

const LINK_DER_KACHEL: Partial<Record<KachelTyp, [string, string]>> = {
  pipeline: ['/geschaefte', 'Alle Geschäfte'],
  prognose: ['/phasen', 'Wahrscheinlichkeiten'],
  aufgaben: ['/aufgaben', 'Alle ansehen'],
};

const GrosseKachel = ({
  kachel,
  werkzeug,
  bearbeiten,
}: {
  kachel: Kachel;
  werkzeug: ReactNode;
  bearbeiten: boolean;
}) => {
  const link = LINK_DER_KACHEL[kachel.typ];
  let inhalt: ReactNode;

  switch (kachel.typ) {
    case 'balken':
      inhalt = <BalkenKachel kachel={kachel} bearbeiten={bearbeiten} />;
      break;
    case 'liste':
      inhalt = <ListeKachel kachel={kachel} />;
      break;
    case 'pipeline':
      inhalt = <PipelineKachel kachel={kachel} />;
      break;
    case 'prognose':
      inhalt = <ForecastChart />;
      break;
    default:
      inhalt = <AufgabenKachel />;
  }

  return (
    <section className="detail-section kachel">
      <div className="section-heading">
        <h2>{titelVon(kachel)}</h2>
        {werkzeug ??
          (link !== undefined && <Link to={link[0]}>{link[1]}</Link>)}
      </div>
      {inhalt}
    </section>
  );
};

const Werkzeug = ({
  kachel,
  stelle,
  anzahl,
  verschieben,
  entfernen,
}: {
  kachel: Kachel;
  stelle: number;
  anzahl: number;
  verschieben: (von: number, um: -1 | 1) => void;
  entfernen: (id: string) => void;
}) => (
  <div
    className="kachel-werkzeug"
    role="group"
    aria-label={`${titelVon(kachel)} anordnen`}
  >
    <button
      type="button"
      className="button button--ghost button--small"
      aria-label={`${titelVon(kachel)} nach vorn`}
      title="Nach vorn"
      disabled={stelle === 0}
      onClick={() => verschieben(stelle, -1)}
    >
      <IconArrowUp size={14} />
    </button>
    <button
      type="button"
      className="button button--ghost button--small"
      aria-label={`${titelVon(kachel)} nach hinten`}
      title="Nach hinten"
      disabled={stelle === anzahl - 1}
      onClick={() => verschieben(stelle, 1)}
    >
      <IconArrowDown size={14} />
    </button>
    <button
      type="button"
      className="button button--ghost button--small"
      aria-label={`${titelVon(kachel)} entfernen`}
      title="Entfernen"
      onClick={() => entfernen(kachel.id)}
    >
      <IconClose size={14} />
    </button>
  </div>
);

const ARTEN_DER_FELDER: Record<Objekt, string> = {
  deal: 'DEAL',
  company: 'COMPANY',
  contact: 'CONTACT',
  task: 'TASK',
  invoice: '',
};

const NeueKachel = ({
  onHinzufuegen,
  voll,
}: {
  onHinzufuegen: (kachel: Kachel) => void;
  voll: boolean;
}) => {
  const pipelines = usePipelines();
  const feldrechte = useFeldrechte();
  const [typ, setTyp] = useState<KachelTyp>('kennzahl');
  const [objekt, setObjekt] = useState<Objekt>('deal');
  const [mass, setMass] = useState<Mass>('anzahl');
  const [gruppe, setGruppe] = useState('phase');
  const [status, setStatus] = useState('alle');
  const [pipelineId, setPipelineId] = useState('');
  const [nurMeine, setNurMeine] = useState(false);
  const [zeitraum, setZeitraum] = useState('alle');
  const [liste, setListe] = useState('ruhend');
  const [titel, setTitel] = useState('');
  const phasen = usePhasen(pipelineId === '' ? null : pipelineId);
  const { data: felder } = useQuery<{
    customFields: {
      key: string;
      label: string;
      type: string;
      archivedAt: string | null;
    }[];
  }>(CUSTOM_FIELDS, {
    variables: { entity: ARTEN_DER_FELDER[objekt] },
    skip: typ !== 'balken' || !hatEigeneFelder(objekt),
  });

  const zaehlt = typ === 'kennzahl' || typ === 'balken';
  const auswahlFelder = (felder?.customFields ?? []).filter(
    (feld) =>
      feld.type === 'SELECT' &&
      feld.archivedAt === null &&
      feldrechte.eigenes(objekt as FeldArt, feld.key) !== 'verborgen',
  );
  const gruppen = [
    ...gruppenFuer(objekt),
    ...(hatEigeneFelder(objekt) ? auswahlFelder : []).map((feld) => ({
      wert: `feld:${feld.key}`,
      label: feld.label,
    })),
  ];
  const statusListe =
    objekt === 'deal'
      ? [
          ...DEAL_STATUS,
          ...phasen
            .filter((phase) => !phase.ausgeblendet)
            .map((phase) => ({
              wert: phase.stage.toLowerCase(),
              label: `Phase: ${phase.label}`,
            })),
        ]
      : objekt === 'task'
        ? TASK_STATUS
        : objekt === 'invoice'
          ? INVOICE_STATUS
          : [];

  const wechsleObjekt = (neu: Objekt) => {
    setObjekt(neu);
    setStatus('alle');
    setMass('anzahl');
    setGruppe(ersteGruppe(neu));
  };

  const absenden = (event: FormEvent) => {
    event.preventDefault();
    onHinzufuegen({
      id: `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      typ,
      titel: titel.trim() === '' ? null : titel.trim(),
      objekt: zaehlt ? objekt : null,
      mass: zaehlt ? mass : null,
      gruppe: typ === 'balken' ? gruppe : null,
      status: zaehlt && status !== 'alle' ? status : null,
      pipelineId:
        (zaehlt && objekt === 'deal') || typ === 'pipeline'
          ? pipelineId === ''
            ? null
            : pipelineId
          : null,
      nurMeine:
        ((zaehlt && hatVerantwortlichen(objekt)) || typ === 'liste') &&
        nurMeine,
      zeitraum: zaehlt && zeitraum !== 'alle' ? zeitraum : null,
      liste: typ === 'liste' ? liste : null,
    });
    setTitel('');
  };

  return (
    <form className="card kachel-neu" onSubmit={absenden}>
      <h2>Kachel hinzufügen</h2>
      {voll && (
        <p className="kachel__hinweis">
          Es passen höchstens {MAX_KACHELN} Kacheln auf eine Übersicht.
        </p>
      )}
      <div className="kachel-neu__felder">
        <label>
          Art
          <select
            aria-label="Art"
            value={typ}
            onChange={(event) => setTyp(event.target.value as KachelTyp)}
          >
            {TYPEN.map((eintrag) => (
              <option key={eintrag.wert} value={eintrag.wert}>
                {eintrag.label}
              </option>
            ))}
          </select>
        </label>

        {zaehlt && (
          <>
            <label>
              Was
              <select
                aria-label="Was"
                value={objekt}
                onChange={(event) =>
                  wechsleObjekt(event.target.value as Objekt)
                }
              >
                {OBJEKTE.map((eintrag) => (
                  <option key={eintrag.wert} value={eintrag.wert}>
                    {eintrag.label}
                  </option>
                ))}
              </select>
            </label>
            {hatBetrag(objekt) && (
              <label>
                Maß
                <select
                  aria-label="Maß"
                  value={mass}
                  onChange={(event) => setMass(event.target.value as Mass)}
                >
                  <option value="anzahl">Anzahl</option>
                  <option value="summe">
                    {objekt === 'invoice'
                      ? 'Summe netto (Umsatz)'
                      : 'Summe des Betrags'}
                  </option>
                  <option value="durchschnitt">Ø Betrag</option>
                </select>
              </label>
            )}
            {typ === 'balken' && (
              <label>
                Gruppiert nach
                <select
                  aria-label="Gruppiert nach"
                  value={gruppe}
                  onChange={(event) => setGruppe(event.target.value)}
                >
                  {gruppen.map((eintrag) => (
                    <option key={eintrag.wert} value={eintrag.wert}>
                      {eintrag.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {statusListe.length > 0 && (
              <label>
                Status
                <select
                  aria-label="Status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  {statusListe.map((eintrag) => (
                    <option key={eintrag.wert} value={eintrag.wert}>
                      {eintrag.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Zeitraum
              <select
                aria-label="Zeitraum"
                value={zeitraum}
                onChange={(event) => setZeitraum(event.target.value)}
              >
                {ZEITRAEUME.map((eintrag) => (
                  <option key={eintrag.wert} value={eintrag.wert}>
                    {eintrag.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {typ === 'liste' && (
          <label>
            Liste
            <select
              aria-label="Liste"
              value={liste}
              onChange={(event) => setListe(event.target.value)}
            >
              {LISTEN.map((eintrag) => (
                <option key={eintrag.wert} value={eintrag.wert}>
                  {eintrag.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {((zaehlt && objekt === 'deal') || typ === 'pipeline') &&
          pipelines.length > 1 && (
            <label>
              Pipeline
              <select
                aria-label="Pipeline"
                value={pipelineId}
                onChange={(event) => setPipelineId(event.target.value)}
              >
                <option value="">
                  {typ === 'pipeline' ? 'Alle Geschäfte' : 'Alle Pipelines'}
                </option>
                {pipelines.map((pipeline) => (
                  <option key={pipeline.id} value={pipeline.id}>
                    {pipeline.name}
                  </option>
                ))}
              </select>
            </label>
          )}

        <label>
          Titel
          <input
            aria-label="Titel"
            value={titel}
            maxLength={80}
            placeholder="Wie die Art, wenn leer"
            onChange={(event) => setTitel(event.target.value)}
          />
        </label>

        {((zaehlt && hatVerantwortlichen(objekt)) || typ === 'liste') && (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={nurMeine}
              onChange={(event) => setNurMeine(event.target.checked)}
            />
            Nur meine
          </label>
        )}
      </div>
      <button className="button" type="submit" disabled={voll}>
        Hinzufügen
      </button>
    </form>
  );
};

const KachelFlaeche = ({
  kacheln,
  bearbeiten,
  sichern,
  hinweis,
  leerText,
  zusatz,
}: {
  kacheln: Kachel[];
  bearbeiten: boolean;
  sichern: (neu: Kachel[]) => void;
  hinweis: string;
  leerText: string;
  zusatz?: ReactNode;
}) => {
  const werte = useAlleKachelWerte(kacheln);

  const verschieben = (von: number, um: -1 | 1) => {
    const neu = [...kacheln];
    const [kachel] = neu.splice(von, 1);

    neu.splice(von + um, 0, kachel);
    sichern(neu);
  };

  const entfernen = (id: string) =>
    sichern(kacheln.filter((kachel) => kachel.id !== id));

  const werkzeug = (kachel: Kachel, stelle: number) =>
    bearbeiten ? (
      <Werkzeug
        kachel={kachel}
        stelle={stelle}
        anzahl={kacheln.length}
        verschieben={verschieben}
        entfernen={entfernen}
      />
    ) : null;

  const bloecke: { kennzahlen: boolean; eintraege: [Kachel, number][] }[] = [];

  kacheln.forEach((kachel, stelle) => {
    const kennzahl = kachel.typ === 'kennzahl';
    const letzter = bloecke[bloecke.length - 1];

    if (kennzahl && letzter?.kennzahlen === true) {
      letzter.eintraege.push([kachel, stelle]);
    } else {
      bloecke.push({ kennzahlen: kennzahl, eintraege: [[kachel, stelle]] });
    }
  });

  return (
    <WerteKontext.Provider value={werte}>
      {bearbeiten && (
        <div className="kachel-leiste">
          <p className="kachel__hinweis">{hinweis}</p>
          {zusatz}
        </div>
      )}

      {kacheln.length === 0 && !bearbeiten && (
        <div className="card kachel__leer">{leerText}</div>
      )}

      {bloecke.map((block) =>
        block.kennzahlen ? (
          <div className="metrics" key={block.eintraege[0][0].id}>
            {block.eintraege.map(([kachel, stelle]) => (
              <div
                className={bearbeiten ? 'kachel kachel--bearbeiten' : 'kachel'}
                key={kachel.id}
              >
                <KennzahlKachel kachel={kachel} bearbeiten={bearbeiten} />
                {werkzeug(kachel, stelle)}
              </div>
            ))}
          </div>
        ) : (
          <GrosseKachel
            key={block.eintraege[0][0].id}
            kachel={block.eintraege[0][0]}
            werkzeug={werkzeug(block.eintraege[0][0], block.eintraege[0][1])}
            bearbeiten={bearbeiten}
          />
        ),
      )}

      {bearbeiten && (
        <NeueKachel
          voll={kacheln.length >= MAX_KACHELN}
          onHinzufuegen={(kachel) => sichern([...kacheln, kachel])}
        />
      )}
    </WerteKontext.Provider>
  );
};

const mitTypname = (kacheln: Kachel[]) =>
  kacheln.map((kachel) => ({
    ...alsEingabe(kachel),
    __typename: 'Kachel',
  })) as unknown as Kachel[];

export const Uebersicht = ({ bearbeiten }: { bearbeiten: boolean }) => {
  const { data, loading, error } = useQuery<{ meineUebersicht: Kachel[] }>(
    MEINE_UEBERSICHT,
  );
  const [speichern, { error: speicherFehler }] = useMutation<{
    uebersichtSpeichern: Kachel[];
  }>(UEBERSICHT_SPEICHERN);
  const [zuruecksetzen] = useMutation<{ uebersichtZuruecksetzen: Kachel[] }>(
    UEBERSICHT_ZURUECKSETZEN,
  );

  if (loading && data === undefined) {
    return <SkeletonMetrics count={6} />;
  }

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  const sichern = (neu: Kachel[]) => {
    void speichern({
      variables: { kacheln: neu.map(alsEingabe) },
      optimisticResponse: { uebersichtSpeichern: mitTypname(neu) },
      update: (cache, { data: antwort }) => {
        if (antwort !== null && antwort !== undefined) {
          cache.writeQuery({
            query: MEINE_UEBERSICHT,
            data: { meineUebersicht: antwort.uebersichtSpeichern },
          });
        }
      },
    }).catch(() => null);
  };

  return (
    <>
      {speicherFehler !== undefined && (
        <div className="error-banner">{speicherFehler.message}</div>
      )}
      <KachelFlaeche
        kacheln={data?.meineUebersicht ?? []}
        bearbeiten={bearbeiten}
        sichern={sichern}
        hinweis="Ordnen Sie Ihre Kacheln mit den Pfeilen, entfernen Sie sie mit dem Kreuz. Die Übersicht gehört nur Ihnen."
        leerText="Ihre Übersicht ist leer. Mit „Anpassen“ fügen Sie Kacheln hinzu."
        zusatz={
          <button
            type="button"
            className="button button--ghost"
            onClick={() =>
              void zuruecksetzen({
                update: (cache, { data: antwort }) => {
                  if (antwort !== null && antwort !== undefined) {
                    cache.writeQuery({
                      query: MEINE_UEBERSICHT,
                      data: {
                        meineUebersicht: antwort.uebersichtZuruecksetzen,
                      },
                    });
                  }
                },
              }).catch(() => null)
            }
          >
            Standard wiederherstellen
          </button>
        }
      />
    </>
  );
};

export type Dashboard = {
  id: string;
  name: string;
  privat: boolean;
  createdById: string | null;
  darfAendern: boolean;
  kacheln: Kachel[];
};

export const DashboardFlaeche = ({
  dashboard,
  bearbeiten,
}: {
  dashboard: Dashboard;
  bearbeiten: boolean;
}) => {
  const [speichern, { error: speicherFehler }] = useMutation<{
    dashboardKachelnSpeichern: Dashboard;
  }>(DASHBOARD_KACHELN_SPEICHERN);

  const sichern = (neu: Kachel[]) => {
    void speichern({
      variables: { id: dashboard.id, kacheln: neu.map(alsEingabe) },
      optimisticResponse: {
        dashboardKachelnSpeichern: {
          ...dashboard,
          kacheln: mitTypname(neu),
          __typename: 'Dashboard',
        } as Dashboard,
      },
    }).catch(() => null);
  };

  return (
    <>
      {speicherFehler !== undefined && (
        <div className="error-banner">{speicherFehler.message}</div>
      )}
      <KachelFlaeche
        kacheln={dashboard.kacheln}
        bearbeiten={bearbeiten && dashboard.darfAendern}
        sichern={sichern}
        hinweis={
          dashboard.privat
            ? 'Ordnen Sie die Kacheln mit den Pfeilen, entfernen Sie sie mit dem Kreuz. Dieses Dashboard sehen nur Sie.'
            : 'Ordnen Sie die Kacheln mit den Pfeilen, entfernen Sie sie mit dem Kreuz. Dieses Dashboard sieht das ganze Team; jede Person sieht darin nur, was ihre Rolle erlaubt.'
        }
        leerText={
          dashboard.darfAendern
            ? 'Dieses Dashboard ist leer. Mit „Anpassen“ fügen Sie Kacheln hinzu.'
            : 'Dieses Dashboard ist leer.'
        }
      />
    </>
  );
};

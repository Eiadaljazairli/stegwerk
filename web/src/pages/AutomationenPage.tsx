import { useMutation, useQuery } from '@apollo/client';
import { type FormEvent, useRef, useState } from 'react';

import {
  AKTION,
  type Aktion,
  ART_AUS_SERVER,
  ART_NAME,
  ART_SERVER,
  type Art,
  artDesErgebnisses,
  BRAUCHT_DATENSATZ,
  LEERER_SCHRITT,
  type Schritt,
  type SchrittAnsicht,
  SchrittFelder,
  SETZBAR,
  schrittAusAnsicht,
  schrittEingabe,
} from '../components/AutomationSchritt';
import { IconRepeat } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { useToast } from '../components/Toast';
import { LoadingAnnouncement } from '../components/Skeleton';
import {
  AUTOMATION_EINGANG_ERNEUERN,
  AUTOMATION_LAUF_ABBRECHEN,
  AUTOMATION_LAUF_WIEDERHOLEN,
  AUTOMATION_PROTOKOLL,
  AUTOMATION_TESTEN,
  AUTOMATIONEN,
  CREATE_AUTOMATION,
  CUSTOM_FIELDS,
  DELETE_AUTOMATION,
  MAIL_TEMPLATES,
  SET_AUTOMATION_AKTIV,
  UPDATE_AUTOMATION,
  WORKSPACE_MEMBERS,
} from '../lib/queries';
import { usePipelines, useStageLabel } from '../lib/stages';
import { STANDARD_FILTER_FELDER } from '../lib/standardFelder';
import {
  CUSTOM_FILTER_OPERATOR_LABELS,
  type CustomField,
  type CustomFieldFilterOperator,
  DEAL_STAGES,
  type DealStage,
  type Membership,
  OPERATORS_FOR_TYPE,
  OPERATORS_WITHOUT_VALUE,
  TAGE_OPERATOREN,
} from '../lib/types';

type Ausloeser =
  | 'GESCHAEFT_ANGELEGT'
  | 'GESCHAEFT_GEAENDERT'
  | 'PHASE_GEAENDERT'
  | 'GESCHAEFT_RUHEND'
  | 'KONTAKT_ANGELEGT'
  | 'KONTAKT_GEAENDERT'
  | 'FIRMA_ANGELEGT'
  | 'FIRMA_GEAENDERT'
  | 'WEBFORMULAR_EINGANG'
  | 'MANUELL'
  | 'ZEITPLAN'
  | 'WEBHOOK_EINGANG';

type Rhythmus = 'TAEGLICH' | 'WOECHENTLICH' | 'MONATLICH';

type Bedingung = {
  key: string;
  operator: CustomFieldFilterOperator;
  value: string | null;
};

type Automation = {
  id: string;
  name: string;
  aktiv: boolean;
  ausloeser: Ausloeser;
  phase: string | null;
  bedingungen: Bedingung[];
  ruhendTage: number | null;
  verzoegerungTage: number;
  art: string | null;
  zeitplan: {
    rhythmus: Rhythmus;
    uhrzeit: string;
    wochentag: number | null;
    monatstag: number | null;
  } | null;
  naechsterLauf: string | null;
  eingangEingerichtet: boolean;
  eingangSigniert: boolean;
  schritte: SchrittAnsicht[];
};

type Status =
  | 'GEPLANT'
  | 'LAEUFT'
  | 'OK'
  | 'UEBERSPRUNGEN'
  | 'FEHLER'
  | 'ABGEBROCHEN';

type Ausfuehrung = {
  id: string;
  zielArt: string;
  status: Status;
  grund: string | null;
  testlauf: boolean;
  faelligAm: string;
  erledigtAm: string | null;
  createdAt: string;
  schritte: {
    nr: number;
    aktion: Aktion;
    status: Status;
    grund: string | null;
    eingabe: string;
    ausgabe: string;
  }[];
};

const AUSLOESER: Record<Ausloeser, string> = {
  GESCHAEFT_ANGELEGT: 'ein Geschäft angelegt wird',
  GESCHAEFT_GEAENDERT: 'ein Geschäft geändert wird',
  PHASE_GEAENDERT: 'ein Geschäft die Phase wechselt',
  GESCHAEFT_RUHEND: 'sich an einem offenen Geschäft nichts mehr tut',
  KONTAKT_ANGELEGT: 'ein Kontakt angelegt wird',
  KONTAKT_GEAENDERT: 'ein Kontakt geändert wird',
  FIRMA_ANGELEGT: 'eine Firma angelegt wird',
  FIRMA_GEAENDERT: 'eine Firma geändert wird',
  WEBFORMULAR_EINGANG: 'eine Anfrage übers Webformular kommt',
  MANUELL: 'jemand den Knopf am Datensatz drückt',
  ZEITPLAN: 'es Zeit ist (Zeitplan)',
  WEBHOOK_EINGANG: 'ein fremder Dienst die Eingangsadresse aufruft',
};

const ART: Record<Ausloeser, Art | null> = {
  GESCHAEFT_ANGELEGT: 'DEAL',
  GESCHAEFT_GEAENDERT: 'DEAL',
  PHASE_GEAENDERT: 'DEAL',
  GESCHAEFT_RUHEND: 'DEAL',
  KONTAKT_ANGELEGT: 'CONTACT',
  KONTAKT_GEAENDERT: 'CONTACT',
  FIRMA_ANGELEGT: 'COMPANY',
  FIRMA_GEAENDERT: 'COMPANY',
  WEBFORMULAR_EINGANG: null,
  MANUELL: null,
  ZEITPLAN: null,
  WEBHOOK_EINGANG: null,
};

const MIT_ART_WAHL: Ausloeser[] = ['MANUELL', 'ZEITPLAN'];

const OHNE_REIHUM: Ausloeser[] = [
  'ZEITPLAN',
  'GESCHAEFT_GEAENDERT',
  'KONTAKT_GEAENDERT',
  'FIRMA_GEAENDERT',
  'PHASE_GEAENDERT',
  'GESCHAEFT_RUHEND',
];

const MAX_SCHRITTE = 5;

const WOCHENTAGE = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
];

const JEDES: Record<Art, string> = {
  DEAL: 'jedes Geschäft',
  CONTACT: 'jeden Kontakt',
  COMPANY: 'jede Firma',
};

const PIPELINE_FELD = {
  id: 'std:pipelineId',
  entity: 'DEAL',
  key: 'std:pipelineId',
  label: 'Pipeline',
  type: 'SELECT',
  options: [],
} as unknown as CustomField;

const PIPELINE_OPERATOREN: CustomFieldFilterOperator[] = [
  'EQUALS',
  'NOT_EQUALS',
];

const STATUS: Record<Status, string> = {
  GEPLANT: 'vorgemerkt',
  LAEUFT: 'läuft',
  OK: 'erledigt',
  UEBERSPRUNGEN: 'übersprungen',
  FEHLER: 'Fehler',
  ABGEBROCHEN: 'abgebrochen',
};

const ZIEL: Record<string, string> = {
  deal: 'Geschäft',
  contact: 'Kontakt',
  company: 'Firma',
  keins: 'ohne Datensatz',
};

const LEER = {
  name: '',
  ausloeser: 'GESCHAEFT_ANGELEGT' as Ausloeser,
  phase: '',
  ruhendTage: '14',
  bedingungen: [] as Bedingung[],
  verzoegerungTage: '0',
  art: '' as Art | '',
  rhythmus: 'TAEGLICH' as Rhythmus,
  uhrzeit: '08:00',
  wochentag: '1',
  monatstag: '1',
  schritte: [LEERER_SCHRITT],
};

type Form = typeof LEER;

const formAus = (a: Automation): Form => ({
  name: a.name,
  ausloeser: a.ausloeser,
  phase: a.phase ?? '',
  ruhendTage: String(a.ruhendTage ?? 14),
  bedingungen: a.bedingungen.map((b) => ({ ...b, value: b.value ?? '' })),
  verzoegerungTage: String(a.verzoegerungTage),
  art: a.art === null ? '' : (ART_AUS_SERVER[a.art] ?? ''),
  rhythmus: a.zeitplan?.rhythmus ?? LEER.rhythmus,
  uhrzeit: a.zeitplan?.uhrzeit ?? LEER.uhrzeit,
  wochentag: String(a.zeitplan?.wochentag ?? 1),
  monatstag: String(a.zeitplan?.monatstag ?? 1),
  schritte:
    a.schritte.length === 0
      ? [LEERER_SCHRITT]
      : a.schritte.map(schrittAusAnsicht),
});

const VORLAGEN: { label: string; form: Partial<Form> }[] = [
  {
    label: 'Gewonnen → Rechnung schreiben',
    form: {
      name: 'Nach Abschluss Rechnung',
      ausloeser: 'PHASE_GEAENDERT',
      phase: 'won',
      schritte: [
        {
          ...LEERER_SCHRITT,
          aktion: 'AUFGABE_ANLEGEN',
          titel: 'Rechnung schreiben',
          faelligInTagen: '1',
        },
      ],
    },
  },
  {
    label: 'Webformular → reihum verteilen',
    form: {
      name: 'Anfragen verteilen',
      ausloeser: 'WEBFORMULAR_EINGANG',
      schritte: [{ ...LEERER_SCHRITT, aktion: 'VERANTWORTLICH_REIHUM' }],
    },
  },
  {
    label: '14 Tage ruhend → Nachfassen',
    form: {
      name: 'Ruhende Geschäfte nachfassen',
      ausloeser: 'GESCHAEFT_RUHEND',
      ruhendTage: '14',
      schritte: [
        {
          ...LEERER_SCHRITT,
          aktion: 'AUFGABE_ANLEGEN',
          titel: 'Nachfassen',
          faelligInTagen: '0',
        },
      ],
    },
  },
  {
    label: 'Neues Geschäft → Erstgespräch',
    form: {
      name: 'Erstgespräch vereinbaren',
      ausloeser: 'GESCHAEFT_ANGELEGT',
      schritte: [
        {
          ...LEERER_SCHRITT,
          aktion: 'AUFGABE_ANLEGEN',
          titel: 'Erstgespräch vereinbaren',
          faelligInTagen: '2',
        },
      ],
    },
  },
  {
    label: 'Fremder Dienst → Kontakt und Aufgabe',
    form: {
      name: 'Eingang aus dem Shop',
      ausloeser: 'WEBHOOK_EINGANG',
      schritte: [
        {
          ...LEERER_SCHRITT,
          aktion: 'ANLEGEN_ODER_AKTUALISIEREN',
          upsertArt: 'CONTACT',
          upsertWerte: {
            email: '{{ausloeser.email}}',
            firstName: '{{ausloeser.vorname}}',
            lastName: '{{ausloeser.nachname}}',
          },
        },
        {
          ...LEERER_SCHRITT,
          aktion: 'AUFGABE_ANLEGEN',
          zielSchritt: '1',
          titel: 'Neue Bestellung von {{schritt1.email}} ansehen',
          faelligInTagen: '0',
        },
      ],
    },
  },
  {
    label: 'Knopf → Angebot nachfassen',
    form: {
      name: 'Angebot nachfassen',
      ausloeser: 'MANUELL',
      art: 'DEAL',
      schritte: [
        {
          ...LEERER_SCHRITT,
          aktion: 'TERMIN_ANLEGEN',
          titel: 'Rückruf zu {{ausloeser.name}}',
          terminInTagen: '2',
        },
      ],
    },
  },
];

const zeit = (iso: string): string =>
  new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));

const huebsch = (text: string): string => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};

const Protokoll = ({ automationId }: { automationId: string }) => {
  const toast = useToast();
  const { data, loading, error } = useQuery<{
    automationProtokoll: Ausfuehrung[];
  }>(AUTOMATION_PROTOKOLL, {
    variables: { automationId },
    fetchPolicy: 'cache-and-network',
  });
  const refetchQueries = [
    { query: AUTOMATION_PROTOKOLL, variables: { automationId } },
  ];
  const [wiederholen, wiederholung] = useMutation(AUTOMATION_LAUF_WIEDERHOLEN, {
    refetchQueries,
  });
  const [abbrechen, abbruch] = useMutation(AUTOMATION_LAUF_ABBRECHEN, {
    refetchQueries,
  });
  const fehlerZeigen = (fehler: Error) => toast.zeige({ text: fehler.message });

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  const eintraege = data?.automationProtokoll ?? [];

  if (loading && data === undefined) {
    return <LoadingAnnouncement />;
  }

  return (
    <ul className="automation-protokoll">
      {eintraege.length === 0 ? (
        <li>Noch nicht ausgeführt.</li>
      ) : (
        eintraege.map((e) => (
          <li key={e.id}>
            <time dateTime={e.erledigtAm ?? e.faelligAm}>
              {zeit(
                e.status === 'GEPLANT'
                  ? e.faelligAm
                  : (e.erledigtAm ?? e.createdAt),
              )}
            </time>
            {e.testlauf && (
              <span className="automation-protokoll__test">Probelauf</span>
            )}
            <span className={`automation-protokoll__status--${e.status}`}>
              {STATUS[e.status]}
              {e.status === 'GEPLANT' ? ' für' : ''}
            </span>
            <span>{ZIEL[e.zielArt] ?? e.zielArt}</span>
            {e.grund !== null && <span>— {e.grund}</span>}
            {e.status === 'GEPLANT' && (
              <button
                type="button"
                className="button button--ghost button--small"
                disabled={abbruch.loading}
                onClick={() =>
                  void abbrechen({
                    variables: { ausfuehrungId: e.id },
                  }).catch(fehlerZeigen)
                }
              >
                Abbrechen
              </button>
            )}
            {!e.testlauf &&
              (e.status === 'FEHLER' ||
                e.status === 'UEBERSPRUNGEN' ||
                e.status === 'ABGEBROCHEN') && (
                <button
                  type="button"
                  className="button button--ghost button--small"
                  disabled={wiederholung.loading}
                  onClick={() =>
                    void wiederholen({
                      variables: { ausfuehrungId: e.id },
                    }).catch(fehlerZeigen)
                  }
                >
                  Wiederholen
                </button>
              )}
            {e.schritte.length > 0 && (
              <details className="automation-protokoll__schritte">
                <summary>
                  {e.schritte.length === 1
                    ? 'Ein- und Ausgabe'
                    : `${String(e.schritte.length)} Schritte`}
                </summary>
                <ol>
                  {e.schritte.map((s) => (
                    <li key={s.nr}>
                      <strong>
                        {String(s.nr)}. {AKTION[s.aktion]}
                      </strong>{' '}
                      <span
                        className={`automation-protokoll__status--${s.status}`}
                      >
                        {STATUS[s.status]}
                      </span>
                      {s.grund !== null && <span> — {s.grund}</span>}
                      <div className="automation-protokoll__daten">
                        <div>
                          <span>Eingabe</span>
                          <pre>{huebsch(s.eingabe)}</pre>
                        </div>
                        <div>
                          <span>Ausgabe</span>
                          <pre>{huebsch(s.ausgabe)}</pre>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </li>
        ))
      )}
    </ul>
  );
};

const Eingang = ({ automation }: { automation: Automation }) => {
  const [mitSignatur, setMitSignatur] = useState(automation.eingangSigniert);
  const [neu, setNeu] = useState<{
    url: string;
    geheimnis: string | null;
  } | null>(null);
  const [erneuern, erneuerung] = useMutation<{
    automationEingangErneuern: { url: string; geheimnis: string | null };
  }>(AUTOMATION_EINGANG_ERNEUERN, {
    refetchQueries: [{ query: AUTOMATIONEN }],
  });

  return (
    <div className="automation-eingang">
      <p>
        {automation.eingangEingerichtet
          ? `Eingangsadresse eingerichtet${
              automation.eingangSigniert ? ', mit Signatur' : ''
            }.`
          : 'Noch keine Eingangsadresse.'}
      </p>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={mitSignatur}
          onChange={(e) => setMitSignatur(e.target.checked)}
        />
        Signatur verlangen
      </label>
      <button
        type="button"
        className="button button--ghost button--small"
        disabled={erneuerung.loading}
        onClick={() => {
          if (
            automation.eingangEingerichtet &&
            !window.confirm(
              'Neue Adresse erzeugen? Die bisherige hört sofort auf zu funktionieren.',
            )
          ) {
            return;
          }

          void erneuern({
            variables: { id: automation.id, mitSignatur },
          })
            .then((antwort) =>
              setNeu(antwort.data?.automationEingangErneuern ?? null),
            )
            .catch(() => null);
        }}
      >
        {automation.eingangEingerichtet
          ? 'Neue Adresse erzeugen'
          : 'Adresse erzeugen'}
      </button>
      {erneuerung.error !== undefined && (
        <div className="error-banner">{erneuerung.error.message}</div>
      )}
      {neu !== null && (
        <div className="automation-eingang__neu">
          <p className="field__hint">
            Nur jetzt sichtbar — bitte gleich beim fremden Dienst eintragen.
          </p>
          <label>
            Adresse (POST, JSON)
            <input
              readOnly
              value={neu.url}
              onFocus={(e) => e.target.select()}
            />
          </label>
          {neu.geheimnis !== null && (
            <label>
              Geheimnis für die Signatur
              <input
                readOnly
                value={neu.geheimnis}
                onFocus={(e) => e.target.select()}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
};

export const AutomationenPage = () => {
  const stageLabel = useStageLabel();
  const pipelines = usePipelines();
  const { data, loading, error } = useQuery<{ automationen: Automation[] }>(
    AUTOMATIONEN,
  );
  const { data: teamData } = useQuery<{ workspaceMembers: Membership[] }>(
    WORKSPACE_MEMBERS,
  );
  const { data: vorlagenData } = useQuery<{
    mailTemplates: { id: string; name: string }[];
  }>(MAIL_TEMPLATES);
  const refetchQueries = [{ query: AUTOMATIONEN }];
  const [anlegen, anlage] = useMutation(CREATE_AUTOMATION, { refetchQueries });
  const [speichern, speicherung] = useMutation(UPDATE_AUTOMATION, {
    refetchQueries,
  });
  const [schalten] = useMutation(SET_AUTOMATION_AKTIV);
  const [loeschen] = useMutation(DELETE_AUTOMATION, { refetchQueries });
  const [testen, probe] = useMutation<{
    automationTesten: Ausfuehrung;
  }>(AUTOMATION_TESTEN);
  const toast = useToast();
  const fehlerZeigen = (fehler: Error) => toast.zeige({ text: fehler.message });
  const [form, setForm] = useState<Form>(LEER);
  const [offen, setOffen] = useState(false);
  const [bearbeitet, setBearbeitet] = useState<Automation | null>(null);
  const formular = useRef<HTMLFormElement>(null);
  const vorgang = bearbeitet === null ? anlage : speicherung;

  const schliessen = () => {
    setForm(LEER);
    setBearbeitet(null);
    setOffen(false);
  };

  const bearbeiten = (a: Automation) => {
    setForm(formAus(a));
    setBearbeitet(a);
    setOffen(true);
    window.requestAnimationFrame(() => {
      formular.current?.scrollIntoView({ block: 'start' });
      formular.current?.querySelector<HTMLInputElement>('input')?.focus();
    });
  };
  const [protokollOffen, setProtokollOffen] = useState<string | null>(null);
  const [eingangOffen, setEingangOffen] = useState<string | null>(null);

  const artVon = (ausloeser: Ausloeser, gewaehlt: Art | ''): Art | null =>
    ART[ausloeser] ??
    (MIT_ART_WAHL.includes(ausloeser) && gewaehlt !== '' ? gewaehlt : null);
  const art = artVon(form.ausloeser, form.art);

  const { data: felderData } = useQuery<{ customFields: CustomField[] }>(
    CUSTOM_FIELDS,
    { variables: { entity: art }, skip: art === null },
  );
  const eigene = (felderData?.customFields ?? []).filter(
    (f) => f.type !== 'RELATION',
  );
  const bedingungsFelder =
    art === null
      ? []
      : [
          ...STANDARD_FILTER_FELDER[art],
          ...(art === 'DEAL' && pipelines.length > 1 ? [PIPELINE_FELD] : []),
          ...eigene,
        ];
  const operatorenFuer = (f: CustomField): CustomFieldFilterOperator[] =>
    f.key === PIPELINE_FELD.key
      ? PIPELINE_OPERATOREN
      : OPERATORS_FOR_TYPE[f.type];

  const team = teamData?.workspaceMembers ?? [];
  const vorlagen = vorlagenData?.mailTemplates ?? [];
  const name = (userId: string | null): string => {
    const person = team.find((m) => m.user.id === userId)?.user;

    return person === undefined
      ? 'jemand, der nicht mehr im Team ist'
      : `${person.firstName} ${person.lastName}`;
  };

  const phasenName = (phase: string): string =>
    stageLabel(phase.toUpperCase() as DealStage);

  const feldName = (key: string | null): string => {
    if (key === null) {
      return '';
    }

    for (const liste of Object.values(SETZBAR)) {
      const treffer = liste.find(([k]) => k === key);

      if (treffer !== undefined) {
        return treffer[1];
      }
    }

    return key;
  };

  const planText = (plan: NonNullable<Automation['zeitplan']>): string =>
    plan.rhythmus === 'TAEGLICH'
      ? `Täglich um ${plan.uhrzeit} Uhr`
      : plan.rhythmus === 'WOECHENTLICH'
        ? `Jeden ${WOCHENTAGE[(plan.wochentag ?? 1) - 1]} um ${plan.uhrzeit} Uhr`
        : `Am ${String(plan.monatstag ?? 1)}. jedes Monats um ${plan.uhrzeit} Uhr`;

  const tun = (s: SchrittAnsicht): string => {
    const wert =
      s.feldKey === 'std:stage' && s.feldWert !== null
        ? phasenName(s.feldWert)
        : s.feldKey === 'std:ownerId'
          ? s.feldWert === null
            ? 'niemand'
            : name(s.feldWert)
          : (s.feldWert ?? 'leer');
    const am =
      s.zielSchritt === null
        ? ''
        : ` (am Datensatz aus Schritt ${String(s.zielSchritt)})`;

    switch (s.aktion) {
      case 'VERANTWORTLICH_REIHUM':
        return `reihum zuteilen an ${s.reihumUserIds.map(name).join(', ')}${am}`;
      case 'NOTIZ_ANLEGEN':
        return `Notiz „${s.titel ?? ''}“ anlegen${am}`;
      case 'FELD_SETZEN':
        return `${feldName(s.feldKey)} auf „${wert}“ setzen${am}`;
      case 'MAIL_SENDEN':
        return s.mailAn === 'HAUPTKONTAKT'
          ? `Vorlage „${
              vorlagen.find((v) => v.id === s.vorlageId)?.name ?? '?'
            }“ an den Kontakt ${s.mailAlsEntwurf ? 'als Entwurf zur Freigabe ablegen' : 'schicken'}${am}`
          : `Mail „${s.titel ?? ''}“ an den Verantwortlichen${am}`;
      case 'DATENSAETZE_SUCHEN':
        return `${
          ART_NAME[ART_AUS_SERVER[s.suchArt ?? ''] ?? 'CONTACT']
        }-Datensätze suchen`;
      case 'ANLEGEN_ODER_AKTUALISIEREN':
        return `${
          ART_NAME[ART_AUS_SERVER[s.upsertArt ?? ''] ?? 'CONTACT']
        } anlegen oder aktualisieren`;
      case 'TERMIN_ANLEGEN':
        return `Termin „${s.titel ?? ''}“ in ${String(
          s.terminInTagen ?? 0,
        )} Tagen um ${s.terminUhrzeit ?? ''} Uhr anlegen${am}`;
      case 'KANAL_NACHRICHT':
        return `Nachricht an ${
          s.kanalDienst === 'teams' ? 'Microsoft Teams' : 'Slack'
        } senden`;
      case 'HTTP_ANFRAGE':
        return `${s.httpMethode ?? 'POST'} an ${(() => {
          try {
            return new URL(s.httpUrl ?? '').host;
          } catch {
            return s.httpUrl ?? '';
          }
        })()} senden`;
      default:
        return `Aufgabe „${s.titel ?? ''}“ für ${
          s.zustaendigUserId === null
            ? 'den Verantwortlichen'
            : name(s.zustaendigUserId)
        }, fällig ${
          (s.faelligInTagen ?? 0) === 0
            ? 'am selben Tag'
            : `in ${String(s.faelligInTagen)} Tagen`
        }${am}`;
    }
  };

  const satz = (a: Automation): string => {
    const regelArt = a.art === null ? null : (ART_AUS_SERVER[a.art] ?? null);
    const anzahl = a.bedingungen.length;
    const bedingt =
      anzahl === 0
        ? ''
        : ` und ${String(anzahl)} ${
            anzahl === 1 ? 'Bedingung zutrifft' : 'Bedingungen zutreffen'
          }`;

    let anfang: string;

    if (a.ausloeser === 'ZEITPLAN' && a.zeitplan !== null) {
      anfang =
        planText(a.zeitplan) +
        (regelArt === null
          ? ''
          : `, für ${JEDES[regelArt]}${
              anzahl === 0
                ? ''
                : `, auf das ${String(anzahl)} ${
                    anzahl === 1
                      ? 'Bedingung zutrifft'
                      : 'Bedingungen zutreffen'
                  }`
            }`);
    } else {
      const wenn =
        a.ausloeser === 'PHASE_GEAENDERT' && a.phase !== null
          ? `ein Geschäft auf „${phasenName(a.phase)}“ wechselt`
          : a.ausloeser === 'GESCHAEFT_RUHEND'
            ? `sich an einem offenen Geschäft ${String(a.ruhendTage ?? 14)} Tage nichts tut`
            : a.ausloeser === 'MANUELL' && regelArt !== null
              ? `jemand den Knopf an ${
                  regelArt === 'COMPANY' ? 'einer' : 'einem'
                } ${ART_NAME[regelArt]} drückt`
              : AUSLOESER[a.ausloeser];

      anfang = `Wenn ${wenn}${bedingt}`;
    }

    const [erster, ...weitere] = a.schritte;
    const wann =
      a.verzoegerungTage > 0
        ? ` — nach ${String(a.verzoegerungTage)} ${
            a.verzoegerungTage === 1 ? 'Tag' : 'Tagen'
          }`
        : '';
    const danach =
      weitere.length === 0
        ? ''
        : ` Danach: ${weitere
            .map((s, i) => `${String(i + 2)}. ${tun(s)}`)
            .join('; ')}.`;

    return `${anfang}: ${erster === undefined ? '' : tun(erster)}${wann}.${danach}`;
  };

  const zahl = (text: string, sonst: number): number => {
    const n = Number.parseInt(text, 10);

    return Number.isFinite(n) ? n : sonst;
  };

  const absenden = (event: FormEvent) => {
    event.preventDefault();

    const [erster, ...weitere] = form.schritte;
    const senden = (variables: Record<string, unknown>) =>
      bearbeitet === null
        ? anlegen({ variables })
        : speichern({ variables: { ...variables, id: bearbeitet.id } });

    void senden({
      input: {
        name: form.name.trim(),
        ausloeser: form.ausloeser,
        phase:
          form.ausloeser === 'PHASE_GEAENDERT' && form.phase !== ''
            ? form.phase
            : null,
        ruhendTage:
          form.ausloeser === 'GESCHAEFT_RUHEND'
            ? zahl(form.ruhendTage, 14)
            : null,
        bedingungen:
          art === null
            ? []
            : form.bedingungen.map((b) => ({
                key: b.key,
                operator: b.operator,
                value: OPERATORS_WITHOUT_VALUE.includes(b.operator)
                  ? null
                  : (b.value ?? '').trim(),
              })),
        verzoegerungTage:
          form.ausloeser === 'MANUELL' ? 0 : zahl(form.verzoegerungTage, 0),
        art:
          MIT_ART_WAHL.includes(form.ausloeser) && form.art !== ''
            ? ART_SERVER[form.art]
            : null,
        zeitplan:
          form.ausloeser === 'ZEITPLAN'
            ? {
                rhythmus: form.rhythmus,
                uhrzeit: form.uhrzeit,
                wochentag:
                  form.rhythmus === 'WOECHENTLICH'
                    ? zahl(form.wochentag, 1)
                    : null,
                monatstag:
                  form.rhythmus === 'MONATLICH'
                    ? zahl(form.monatstag, 1)
                    : null,
              }
            : null,
        aktiv: bearbeitet === null ? undefined : bearbeitet.aktiv,
        ...schrittEingabe(erster),
        weitereSchritte: weitere.map(schrittEingabe),
      },
    })
      .then(() => {
        if (bearbeitet !== null) {
          toast.zeige({
            text: `„${form.name.trim()}“ gespeichert. Die Änderung gilt ab dem nächsten Lauf.`,
          });
        }

        schliessen();
      })
      .catch(() => null);
  };

  const probelauf = (a: Automation) => {
    let beispiel: string | null = null;

    if (a.ausloeser === 'WEBHOOK_EINGANG') {
      const eingabe = window.prompt(
        'Beispielinhalt als JSON (leer: der letzte echte Eingang)',
        '',
      );

      if (eingabe === null) {
        return;
      }

      beispiel = eingabe.trim() === '' ? null : eingabe;
    }

    void testen({
      variables: { id: a.id, beispiel },
      refetchQueries: [
        { query: AUTOMATION_PROTOKOLL, variables: { automationId: a.id } },
      ],
    })
      .then((antwort) => {
        const lauf = antwort.data?.automationTesten;

        setProtokollOffen(a.id);
        toast.zeige({
          text:
            lauf === undefined
              ? 'Probelauf fertig.'
              : `Probelauf: ${STATUS[lauf.status]}${
                  lauf.grund === null
                    ? ''
                    : ` — ${lauf.grund.replace(/\.$/u, '')}`
                }. Nichts wurde gespeichert oder verschickt.`,
        });
      })
      .catch(fehlerZeigen);
  };

  const bedingungAendern = (index: number, neu: Partial<Bedingung>) =>
    setForm({
      ...form,
      bedingungen: form.bedingungen.map((b, i) =>
        i === index ? { ...b, ...neu } : b,
      ),
    });

  const neueArt = (ausloeser: Ausloeser, gewaehlt: Art | '') => {
    const neu = artVon(ausloeser, gewaehlt);
    const gleich = neu === art;

    setForm({
      ...form,
      ausloeser,
      art: gewaehlt,
      bedingungen: gleich ? form.bedingungen : [],
      schritte: form.schritte.map((s) => {
        let aktion = s.aktion;

        if (
          aktion === 'VERANTWORTLICH_REIHUM' &&
          OHNE_REIHUM.includes(ausloeser)
        ) {
          aktion = 'AUFGABE_ANLEGEN';
        }

        if (
          s.zielSchritt === '' &&
          neu === null &&
          (ausloeser !== 'WEBFORMULAR_EINGANG' || aktion === 'FELD_SETZEN') &&
          BRAUCHT_DATENSATZ.includes(aktion)
        ) {
          aktion =
            ausloeser === 'WEBFORMULAR_EINGANG'
              ? 'AUFGABE_ANLEGEN'
              : 'ANLEGEN_ODER_AKTUALISIEREN';
        }

        return {
          ...s,
          aktion,
          feldKey: gleich ? s.feldKey : '',
          feldWert: gleich ? s.feldWert : '',
        };
      }),
    });
  };

  const ergebnisArt = (index: number): Art | null => {
    const s = form.schritte[index] as Schritt | undefined;

    return s === undefined
      ? null
      : artDesErgebnisses(s, s.zielSchritt === '' ? art : null);
  };

  const artVonSchritt = (index: number): Art | null => {
    const s = form.schritte[index];

    return s.zielSchritt === '' ? art : ergebnisArt(zahl(s.zielSchritt, 1) - 1);
  };

  const schrittAendern = (index: number, neu: Schritt) =>
    setForm({
      ...form,
      schritte: form.schritte.map((s, i) => (i === index ? neu : s)),
    });

  const liste = data?.automationen ?? [];

  const kopf = (
    <ObjectHeader
      hilfe="automationen"
      kind="field"
      icon={IconRepeat}
      label="Einstellungen"
      title="Automationen"
      note="Wenn etwas passiert, sich ändert, liegen bleibt, jemand den Knopf drückt, die Uhr schlägt oder ein fremder Dienst sich meldet, erledigt Stegwerk bis zu fünf Schritte nacheinander. Was eine Automation tut, löst selbst keine weitere aus."
      actions={
        error === undefined && (
          <button
            type="button"
            className="button"
            onClick={() => {
              if (offen) {
                schliessen();
              } else {
                setForm(LEER);
                setBearbeitet(null);
                setOffen(true);
              }
            }}
          >
            {offen ? 'Schließen' : 'Neue Automation'}
          </button>
        )
      }
    />
  );

  if (error !== undefined) {
    return (
      <>
        {kopf}
        <div className="error-banner">{error.message}</div>
      </>
    );
  }

  return (
    <>
      {kopf}

      <div className="automation-vorlagen" aria-label="Vorlagen">
        {VORLAGEN.map((v) => (
          <button
            key={v.label}
            type="button"
            className="button button--ghost button--small"
            onClick={() => {
              setForm({ ...LEER, ...v.form });
              setBearbeitet(null);
              setOffen(true);
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {offen && (
        <form
          ref={formular}
          className="card automation-form"
          onSubmit={absenden}
          aria-label={
            bearbeitet === null
              ? 'Neue Automation'
              : `Automation „${bearbeitet.name}“ ändern`
          }
        >
          {bearbeitet !== null && (
            <p className="field__hint">
              Sie ändern „{bearbeitet.name}“. Die Änderung gilt ab dem nächsten
              Lauf; danach läuft die Regel mit Ihren Rechten. Gespeicherte Werte
              von Köpfen bleiben, wenn Sie das Feld leer lassen und die Adresse
              zum selben Dienst zeigt.
            </p>
          )}
          <div className="field">
            <label htmlFor="auto-name">Name</label>
            <input
              id="auto-name"
              required
              maxLength={120}
              placeholder="z. B. Anfragen verteilen"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="automation-form__satz">
            <div className="field">
              <label htmlFor="auto-wenn">Wenn</label>
              <select
                id="auto-wenn"
                value={form.ausloeser}
                onChange={(e) => {
                  const neu = e.target.value as Ausloeser;

                  neueArt(
                    neu,
                    neu === 'MANUELL' && form.art === '' ? 'DEAL' : form.art,
                  );
                }}
              >
                {(Object.keys(AUSLOESER) as Ausloeser[]).map((key) => (
                  <option key={key} value={key}>
                    {AUSLOESER[key]}
                  </option>
                ))}
              </select>
            </div>

            {MIT_ART_WAHL.includes(form.ausloeser) && (
              <div className="field">
                <label htmlFor="auto-art">
                  {form.ausloeser === 'MANUELL' ? 'an' : 'für'}
                </label>
                <select
                  id="auto-art"
                  value={form.art}
                  onChange={(e) =>
                    neueArt(form.ausloeser, e.target.value as Art | '')
                  }
                >
                  {form.ausloeser === 'ZEITPLAN' && (
                    <option value="">keinen Datensatz, einmal</option>
                  )}
                  <option value="DEAL">
                    {form.ausloeser === 'MANUELL'
                      ? 'Geschäften'
                      : 'jedes passende Geschäft'}
                  </option>
                  <option value="CONTACT">
                    {form.ausloeser === 'MANUELL'
                      ? 'Kontakten'
                      : 'jeden passenden Kontakt'}
                  </option>
                  <option value="COMPANY">
                    {form.ausloeser === 'MANUELL'
                      ? 'Firmen'
                      : 'jede passende Firma'}
                  </option>
                </select>
              </div>
            )}

            {form.ausloeser === 'PHASE_GEAENDERT' && (
              <div className="field">
                <label htmlFor="auto-phase">auf die Phase</label>
                <select
                  id="auto-phase"
                  value={form.phase}
                  onChange={(e) => setForm({ ...form, phase: e.target.value })}
                >
                  <option value="">jede Phase</option>
                  {DEAL_STAGES.map((stage) => (
                    <option key={stage} value={stage.toLowerCase()}>
                      {stageLabel(stage)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {form.ausloeser === 'GESCHAEFT_RUHEND' && (
              <div className="field">
                <label htmlFor="auto-ruhend">seit Tagen</label>
                <input
                  id="auto-ruhend"
                  type="number"
                  min={1}
                  max={365}
                  value={form.ruhendTage}
                  onChange={(e) =>
                    setForm({ ...form, ruhendTage: e.target.value })
                  }
                />
              </div>
            )}
          </div>

          {form.ausloeser === 'ZEITPLAN' && (
            <div className="automation-form__satz">
              <div className="field">
                <label htmlFor="auto-rhythmus">Rhythmus</label>
                <select
                  id="auto-rhythmus"
                  value={form.rhythmus}
                  onChange={(e) =>
                    setForm({ ...form, rhythmus: e.target.value as Rhythmus })
                  }
                >
                  <option value="TAEGLICH">täglich</option>
                  <option value="WOECHENTLICH">wöchentlich</option>
                  <option value="MONATLICH">monatlich</option>
                </select>
              </div>
              {form.rhythmus === 'WOECHENTLICH' && (
                <div className="field">
                  <label htmlFor="auto-wochentag">am</label>
                  <select
                    id="auto-wochentag"
                    value={form.wochentag}
                    onChange={(e) =>
                      setForm({ ...form, wochentag: e.target.value })
                    }
                  >
                    {WOCHENTAGE.map((tag, i) => (
                      <option key={tag} value={String(i + 1)}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {form.rhythmus === 'MONATLICH' && (
                <div className="field">
                  <label htmlFor="auto-monatstag">am Tag</label>
                  <input
                    id="auto-monatstag"
                    type="number"
                    min={1}
                    max={28}
                    value={form.monatstag}
                    onChange={(e) =>
                      setForm({ ...form, monatstag: e.target.value })
                    }
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="auto-uhrzeit">um (deutsche Zeit)</label>
                <input
                  id="auto-uhrzeit"
                  type="time"
                  required
                  value={form.uhrzeit}
                  onChange={(e) =>
                    setForm({ ...form, uhrzeit: e.target.value })
                  }
                />
              </div>
            </div>
          )}

          {form.ausloeser === 'WEBHOOK_EINGANG' && (
            <p className="field__hint">
              Nach dem Anlegen erzeugen Sie in der Liste eine geheime Adresse.
              Der fremde Dienst schickt dorthin JSON; die Felder stehen den
              Schritten als {'{{'}ausloeser.feld{'}}'} zur Verfügung.
            </p>
          )}

          {art !== null && (
            <fieldset className="automation-bedingungen">
              <legend>
                {form.ausloeser === 'ZEITPLAN'
                  ? 'nur Datensätze, bei denen'
                  : 'und wenn außerdem'}
              </legend>
              {form.bedingungen.map((b, index) => {
                const feld = bedingungsFelder.find((f) => f.key === b.key);
                const operatoren =
                  feld === undefined ? [] : operatorenFuer(feld);

                return (
                  <div className="automation-bedingung" key={index}>
                    <select
                      aria-label="Feld"
                      value={b.key}
                      onChange={(e) => {
                        const neu = bedingungsFelder.find(
                          (f) => f.key === e.target.value,
                        );

                        bedingungAendern(index, {
                          key: e.target.value,
                          operator:
                            neu === undefined
                              ? 'EQUALS'
                              : operatorenFuer(neu)[0],
                          value: '',
                        });
                      }}
                    >
                      {bedingungsFelder.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Vergleich"
                      value={b.operator}
                      onChange={(e) =>
                        bedingungAendern(index, {
                          operator: e.target.value as CustomFieldFilterOperator,
                        })
                      }
                    >
                      {operatoren.map((o) => (
                        <option key={o} value={o}>
                          {CUSTOM_FILTER_OPERATOR_LABELS[o]}
                        </option>
                      ))}
                    </select>
                    {b.key === PIPELINE_FELD.key ? (
                      <select
                        aria-label="Wert"
                        required
                        value={b.value ?? ''}
                        onChange={(e) =>
                          bedingungAendern(index, { value: e.target.value })
                        }
                      >
                        <option value="" disabled>
                          Pipeline wählen…
                        </option>
                        {pipelines.map((pipeline) => (
                          <option key={pipeline.id} value={pipeline.id}>
                            {pipeline.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      !OPERATORS_WITHOUT_VALUE.includes(b.operator) && (
                        <input
                          aria-label="Wert"
                          type={
                            TAGE_OPERATOREN.includes(b.operator) ||
                            ['NUMBER', 'CURRENCY', 'RATING'].includes(
                              feld?.type ?? '',
                            )
                              ? 'number'
                              : feld?.type === 'DATE'
                                ? 'date'
                                : 'text'
                          }
                          placeholder={
                            TAGE_OPERATOREN.includes(b.operator) ? 'Tage' : ''
                          }
                          required
                          value={b.value ?? ''}
                          onChange={(e) =>
                            bedingungAendern(index, { value: e.target.value })
                          }
                        />
                      )
                    )}
                    <button
                      type="button"
                      className="button button--ghost button--small"
                      onClick={() =>
                        setForm({
                          ...form,
                          bedingungen: form.bedingungen.filter(
                            (_b, i) => i !== index,
                          ),
                        })
                      }
                    >
                      Entfernen
                    </button>
                  </div>
                );
              })}
              {form.bedingungen.length < 10 && bedingungsFelder.length > 0 && (
                <button
                  type="button"
                  className="button button--ghost button--small"
                  onClick={() => {
                    const erstes = bedingungsFelder[0];

                    setForm({
                      ...form,
                      bedingungen: [
                        ...form.bedingungen,
                        {
                          key: erstes.key,
                          operator: OPERATORS_FOR_TYPE[erstes.type][0],
                          value: '',
                        },
                      ],
                    });
                  }}
                >
                  Bedingung hinzufügen
                </button>
              )}
            </fieldset>
          )}

          {form.ausloeser !== 'MANUELL' && (
            <div className="automation-form__satz">
              <div className="field">
                <label htmlFor="auto-wann">wann</label>
                <select
                  id="auto-wann"
                  value={form.verzoegerungTage === '0' ? 'sofort' : 'spaeter'}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      verzoegerungTage: e.target.value === 'sofort' ? '0' : '3',
                    })
                  }
                >
                  <option value="sofort">sofort</option>
                  <option value="spaeter">nach einigen Tagen</option>
                </select>
              </div>
              {form.verzoegerungTage !== '0' && (
                <div className="field">
                  <label htmlFor="auto-verzoegerung">nach Tagen</label>
                  <input
                    id="auto-verzoegerung"
                    type="number"
                    min={1}
                    max={365}
                    value={form.verzoegerungTage}
                    onChange={(e) =>
                      setForm({ ...form, verzoegerungTage: e.target.value })
                    }
                  />
                </div>
              )}
            </div>
          )}

          {form.schritte.map((schritt, index) => (
            <div className="automation-schritt__rahmen" key={index}>
              <SchrittFelder
                nr={index + 1}
                schritt={schritt}
                onChange={(neu) => schrittAendern(index, neu)}
                art={artVonSchritt(index)}
                datensatz={
                  form.ausloeser === 'WEBFORMULAR_EINGANG' &&
                  schritt.zielSchritt === ''
                }
                frueher={form.schritte.slice(0, index).map((s, i) => {
                  const ergebnis = ergebnisArt(i);

                  return {
                    nr: i + 1,
                    art: ergebnis,
                    name:
                      ergebnis === null
                        ? AKTION[s.aktion]
                        : `${ART_NAME[ergebnis]}, ${AKTION[s.aktion]}`,
                  };
                })}
                reihumErlaubt={!OHNE_REIHUM.includes(form.ausloeser)}
                team={team}
                vorlagen={vorlagen}
              />
              {index > 0 && index === form.schritte.length - 1 && (
                <button
                  type="button"
                  className="button button--ghost button--small"
                  onClick={() =>
                    setForm({
                      ...form,
                      schritte: form.schritte.slice(0, -1),
                    })
                  }
                >
                  Schritt {index + 1} entfernen
                </button>
              )}
            </div>
          ))}

          {form.schritte.length < MAX_SCHRITTE && (
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() =>
                setForm({
                  ...form,
                  schritte: [
                    ...form.schritte,
                    {
                      ...LEERER_SCHRITT,
                      zielSchritt:
                        art === null && form.ausloeser !== 'WEBFORMULAR_EINGANG'
                          ? String(
                              form.schritte.findIndex(
                                (_s, i) => ergebnisArt(i) !== null,
                              ) + 1 || '',
                            )
                          : '',
                    },
                  ],
                })
              }
            >
              Weiteren Schritt hinzufügen
            </button>
          )}

          {vorgang.error !== undefined && (
            <div className="error-banner">{vorgang.error.message}</div>
          )}

          <div className="row-actions">
            <button type="submit" className="button" disabled={vorgang.loading}>
              {bearbeitet === null
                ? 'Automation anlegen'
                : 'Änderungen speichern'}
            </button>
            {bearbeitet !== null && (
              <>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={probe.loading}
                  title="Prüft die gespeicherte Fassung. Erst speichern, dann zur Probe laufen lassen."
                  onClick={() => probelauf(bearbeitet)}
                >
                  Probelauf (gespeicherte Fassung)
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={schliessen}
                >
                  Abbrechen
                </button>
              </>
            )}
          </div>
        </form>
      )}

      {loading && data === undefined ? (
        <LoadingAnnouncement />
      ) : liste.length === 0 ? (
        <p className="notes__empty">
          Noch keine Automation. Ein guter Anfang ist eine der Vorlagen oben.
        </p>
      ) : (
        <ul className="card automation-liste">
          {liste.map((a) => (
            <li
              key={a.id}
              className={
                a.aktiv
                  ? 'automation-liste__eintrag'
                  : 'automation-liste__eintrag is-aus'
              }
            >
              <div>
                <strong>{a.name}</strong>
                <p>{satz(a)}</p>
                {a.ausloeser === 'ZEITPLAN' &&
                  a.aktiv &&
                  a.naechsterLauf !== null && (
                    <p className="field__hint">
                      Nächster Lauf: {zeit(a.naechsterLauf)}
                    </p>
                  )}
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="button button--ghost row-action"
                  aria-label={`„${a.name}“ bearbeiten`}
                  onClick={() => bearbeiten(a)}
                >
                  Bearbeiten
                </button>
                <button
                  type="button"
                  className="button button--ghost row-action"
                  disabled={probe.loading}
                  title="Läuft einmal zur Probe: nichts wird gespeichert, keine Mail und keine Anfrage verlässt Stegwerk."
                  onClick={() => probelauf(a)}
                >
                  Probelauf
                </button>
                {a.ausloeser === 'WEBHOOK_EINGANG' && (
                  <button
                    type="button"
                    className="button button--ghost row-action"
                    aria-expanded={eingangOffen === a.id}
                    onClick={() =>
                      setEingangOffen(eingangOffen === a.id ? null : a.id)
                    }
                  >
                    Eingang
                  </button>
                )}
                <button
                  type="button"
                  className="button button--ghost row-action"
                  aria-expanded={protokollOffen === a.id}
                  onClick={() =>
                    setProtokollOffen(protokollOffen === a.id ? null : a.id)
                  }
                >
                  Protokoll
                </button>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={a.aktiv}
                    aria-label={`${a.name} aktiv`}
                    onChange={(e) =>
                      void schalten({
                        variables: { id: a.id, aktiv: e.target.checked },
                      }).catch(fehlerZeigen)
                    }
                  />
                  Aktiv
                </label>
                <button
                  type="button"
                  className="button button--danger row-action"
                  onClick={() => {
                    if (window.confirm(`„${a.name}“ löschen?`)) {
                      void loeschen({ variables: { id: a.id } })
                        .then(() => {
                          if (bearbeitet?.id === a.id) {
                            schliessen();
                          }
                        })
                        .catch(fehlerZeigen);
                    }
                  }}
                >
                  Löschen
                </button>
              </div>
              {eingangOffen === a.id && <Eingang automation={a} />}
              {protokollOffen === a.id && <Protokoll automationId={a.id} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

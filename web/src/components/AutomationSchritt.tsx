import { useQuery } from '@apollo/client';

import {
  KANAL_ANLEITUNG,
  KANAL_NAMEN,
  type KanalDienst,
  kanalHinweis,
} from '../lib/kanalNachricht';
import { CUSTOM_FIELDS } from '../lib/queries';
import { useStageLabel } from '../lib/stages';
import { STANDARD_FILTER_FELDER } from '../lib/standardFelder';
import {
  CUSTOM_FILTER_OPERATOR_LABELS,
  type CustomField,
  type CustomFieldFilterOperator,
  DEAL_STAGES,
  type Membership,
  OPERATORS_FOR_TYPE,
  OPERATORS_WITHOUT_VALUE,
} from '../lib/types';

export type Aktion =
  | 'AUFGABE_ANLEGEN'
  | 'NOTIZ_ANLEGEN'
  | 'VERANTWORTLICH_REIHUM'
  | 'FELD_SETZEN'
  | 'MAIL_SENDEN'
  | 'DATENSAETZE_SUCHEN'
  | 'ANLEGEN_ODER_AKTUALISIEREN'
  | 'TERMIN_ANLEGEN'
  | 'HTTP_ANFRAGE'
  | 'KANAL_NACHRICHT';

export type MailAn = 'VERANTWORTLICH' | 'HAUPTKONTAKT';

export type Art = 'DEAL' | 'CONTACT' | 'COMPANY';

export const ART_SERVER: Record<Art, string> = {
  DEAL: 'deal',
  CONTACT: 'contact',
  COMPANY: 'company',
};

export const ART_AUS_SERVER: Record<string, Art> = {
  deal: 'DEAL',
  contact: 'CONTACT',
  company: 'COMPANY',
};

export const ART_NAME: Record<Art, string> = {
  DEAL: 'Geschäft',
  CONTACT: 'Kontakt',
  COMPANY: 'Firma',
};

export const AKTION: Record<Aktion, string> = {
  AUFGABE_ANLEGEN: 'Aufgabe anlegen',
  NOTIZ_ANLEGEN: 'Notiz anlegen',
  FELD_SETZEN: 'Feld setzen',
  MAIL_SENDEN: 'E-Mail senden',
  VERANTWORTLICH_REIHUM: 'Verantwortlichen reihum zuteilen',
  DATENSAETZE_SUCHEN: 'Datensätze suchen',
  ANLEGEN_ODER_AKTUALISIEREN: 'Anlegen oder aktualisieren',
  TERMIN_ANLEGEN: 'Termin anlegen',
  HTTP_ANFRAGE: 'HTTP-Anfrage senden',
  KANAL_NACHRICHT: 'Nachricht an Slack oder Teams',
};

export const BRAUCHT_DATENSATZ: Aktion[] = [
  'AUFGABE_ANLEGEN',
  'NOTIZ_ANLEGEN',
  'VERANTWORTLICH_REIHUM',
  'FELD_SETZEN',
  'MAIL_SENDEN',
  'TERMIN_ANLEGEN',
];

export const SETZBAR: Record<Art, [string, string][]> = {
  DEAL: [
    ['std:stage', 'Phase'],
    ['std:probability', 'Wahrscheinlichkeit'],
    ['std:ownerId', 'Verantwortlich'],
  ],
  CONTACT: [['std:ownerId', 'Verantwortlich']],
  COMPANY: [['std:ownerId', 'Verantwortlich']],
};

export const UPSERT_FELDER: Record<Art, [string, string][]> = {
  CONTACT: [
    ['email', 'E-Mail (erkennt den Kontakt)'],
    ['firstName', 'Vorname'],
    ['lastName', 'Nachname'],
    ['phone', 'Telefon'],
    ['jobTitle', 'Position'],
  ],
  COMPANY: [
    ['domain', 'Domain (erkennt die Firma)'],
    ['name', 'Name (sonst erkennt er sie)'],
    ['website', 'Website'],
    ['city', 'Stadt'],
    ['industry', 'Branche'],
  ],
  DEAL: [
    ['name', 'Bezeichnung (erkennt das offene Geschäft)'],
    ['amount', 'Betrag'],
  ],
};

export type Schritt = {
  aktion: Aktion;
  titel: string;
  faelligInTagen: string;
  zustaendigUserId: string;
  reihumUserIds: string[];
  feldKey: string;
  feldWert: string;
  mailAn: MailAn;
  mailText: string;
  vorlageId: string;
  mailAlsEntwurf: boolean;
  zielSchritt: string;
  suchArt: Art;
  suchFeld: string;
  suchVergleich: CustomFieldFilterOperator;
  suchWert: string;
  upsertArt: Art;
  upsertWerte: Record<string, string>;
  terminInTagen: string;
  terminUhrzeit: string;
  terminDauer: string;
  terminOrt: string;
  httpMethode: string;
  httpUrl: string;
  httpHeader: { name: string; wert: string; gespeichert?: boolean }[];
  httpRumpf: string;
  kanalDienst: KanalDienst;
  kanalUrl: string;
  kanalGespeichert: string | null;
  kanalText: string;
  kanalLink: boolean;
};

export const LEERER_SCHRITT: Schritt = {
  aktion: 'AUFGABE_ANLEGEN',
  titel: '',
  faelligInTagen: '1',
  zustaendigUserId: '',
  reihumUserIds: [],
  feldKey: '',
  feldWert: '',
  mailAn: 'VERANTWORTLICH',
  mailText: '',
  vorlageId: '',
  mailAlsEntwurf: false,
  zielSchritt: '',
  suchArt: 'CONTACT',
  suchFeld: 'std:email',
  suchVergleich: 'EQUALS',
  suchWert: '',
  upsertArt: 'CONTACT',
  upsertWerte: {},
  terminInTagen: '1',
  terminUhrzeit: '09:00',
  terminDauer: '30',
  terminOrt: '',
  httpMethode: 'POST',
  httpUrl: '',
  httpHeader: [],
  httpRumpf: '',
  kanalDienst: 'slack',
  kanalUrl: '',
  kanalGespeichert: null,
  kanalText: '',
  kanalLink: true,
};

export type SchrittAnsicht = {
  aktion: Aktion;
  titel: string | null;
  faelligInTagen: number | null;
  zustaendigUserId: string | null;
  reihumUserIds: string[];
  feldKey: string | null;
  feldWert: string | null;
  mailAn: MailAn | null;
  mailText: string | null;
  vorlageId: string | null;
  zielSchritt: number | null;
  suchArt: string | null;
  suchFeld: string | null;
  suchVergleich: string | null;
  suchWert: string | null;
  upsertArt: string | null;
  upsertWerte: { feld: string; wert: string }[];
  terminInTagen: number | null;
  terminUhrzeit: string | null;
  terminDauer: number | null;
  terminOrt: string | null;
  httpMethode: string | null;
  httpUrl: string | null;
  httpKoepfe: string[];
  httpRumpf: string | null;
  mailAlsEntwurf: boolean;
  kanalDienst: string | null;
  kanalUrlAnzeige: string | null;
  kanalText: string | null;
  kanalLink: boolean;
};

const textOder = (wert: number | null, sonst: string): string =>
  wert === null ? sonst : String(wert);

export const schrittAusAnsicht = (a: SchrittAnsicht): Schritt => ({
  ...LEERER_SCHRITT,
  aktion: a.aktion,
  titel: a.titel ?? '',
  faelligInTagen: textOder(a.faelligInTagen, LEERER_SCHRITT.faelligInTagen),
  zustaendigUserId: a.zustaendigUserId ?? '',
  reihumUserIds: a.reihumUserIds,
  feldKey: a.feldKey ?? '',
  feldWert: a.feldWert ?? '',
  mailAn: a.mailAn ?? LEERER_SCHRITT.mailAn,
  mailText: a.mailText ?? '',
  vorlageId: a.vorlageId ?? '',
  zielSchritt: a.zielSchritt === null ? '' : String(a.zielSchritt),
  suchArt: ART_AUS_SERVER[a.suchArt ?? ''] ?? LEERER_SCHRITT.suchArt,
  suchFeld: a.suchFeld ?? LEERER_SCHRITT.suchFeld,
  suchVergleich:
    (a.suchVergleich as CustomFieldFilterOperator | null) ??
    LEERER_SCHRITT.suchVergleich,
  suchWert: a.suchWert ?? '',
  upsertArt: ART_AUS_SERVER[a.upsertArt ?? ''] ?? LEERER_SCHRITT.upsertArt,
  upsertWerte: Object.fromEntries(
    a.upsertWerte.map(({ feld, wert }) => [feld, wert]),
  ),
  terminInTagen: textOder(a.terminInTagen, LEERER_SCHRITT.terminInTagen),
  terminUhrzeit: a.terminUhrzeit ?? LEERER_SCHRITT.terminUhrzeit,
  terminDauer: textOder(a.terminDauer, LEERER_SCHRITT.terminDauer),
  terminOrt: a.terminOrt ?? '',
  httpMethode: a.httpMethode ?? LEERER_SCHRITT.httpMethode,
  httpUrl: a.httpUrl ?? '',
  httpHeader: a.httpKoepfe.map((name) => ({
    name,
    wert: '',
    gespeichert: true,
  })),
  httpRumpf: a.httpRumpf ?? '',
  mailAlsEntwurf: a.mailAlsEntwurf,
  kanalDienst: a.kanalDienst === 'teams' ? 'teams' : 'slack',
  kanalUrl: '',
  kanalGespeichert: a.kanalUrlAnzeige,
  kanalText: a.kanalText ?? '',
  kanalLink: a.kanalLink,
});

const zahl = (text: string, sonst: number): number => {
  const n = Number.parseInt(text, 10);

  return Number.isFinite(n) ? n : sonst;
};

export const schrittEingabe = (s: Schritt) => {
  const a = s.aktion;

  return {
    aktion: a,
    titel:
      a === 'AUFGABE_ANLEGEN' ||
      a === 'NOTIZ_ANLEGEN' ||
      a === 'TERMIN_ANLEGEN' ||
      (a === 'MAIL_SENDEN' && s.mailAn === 'VERANTWORTLICH')
        ? s.titel.trim()
        : null,
    faelligInTagen: a === 'AUFGABE_ANLEGEN' ? zahl(s.faelligInTagen, 0) : null,
    zustaendigUserId:
      a === 'AUFGABE_ANLEGEN' && s.zustaendigUserId !== ''
        ? s.zustaendigUserId
        : null,
    reihumUserIds: a === 'VERANTWORTLICH_REIHUM' ? s.reihumUserIds : null,
    feldKey: a === 'FELD_SETZEN' ? s.feldKey : null,
    feldWert: a === 'FELD_SETZEN' ? s.feldWert : null,
    mailAn: a === 'MAIL_SENDEN' ? s.mailAn : null,
    mailText:
      a === 'MAIL_SENDEN' && s.mailAn === 'VERANTWORTLICH' ? s.mailText : null,
    vorlageId:
      a === 'MAIL_SENDEN' && s.mailAn === 'HAUPTKONTAKT' && s.vorlageId !== ''
        ? s.vorlageId
        : null,
    mailAlsEntwurf:
      a === 'MAIL_SENDEN' && s.mailAn === 'HAUPTKONTAKT'
        ? s.mailAlsEntwurf
        : null,
    zielSchritt:
      BRAUCHT_DATENSATZ.includes(a) && s.zielSchritt !== ''
        ? zahl(s.zielSchritt, 1)
        : null,
    suchArt: a === 'DATENSAETZE_SUCHEN' ? ART_SERVER[s.suchArt] : null,
    suchFeld: a === 'DATENSAETZE_SUCHEN' ? s.suchFeld : null,
    suchVergleich: a === 'DATENSAETZE_SUCHEN' ? s.suchVergleich : null,
    suchWert: a === 'DATENSAETZE_SUCHEN' ? s.suchWert : null,
    upsertArt:
      a === 'ANLEGEN_ODER_AKTUALISIEREN' ? ART_SERVER[s.upsertArt] : null,
    upsertWerte:
      a === 'ANLEGEN_ODER_AKTUALISIEREN'
        ? Object.entries(s.upsertWerte)
            .filter(([, wert]) => wert.trim() !== '')
            .map(([feld, wert]) => ({ feld, wert }))
        : null,
    terminInTagen: a === 'TERMIN_ANLEGEN' ? zahl(s.terminInTagen, 1) : null,
    terminUhrzeit: a === 'TERMIN_ANLEGEN' ? s.terminUhrzeit : null,
    terminDauer: a === 'TERMIN_ANLEGEN' ? zahl(s.terminDauer, 30) : null,
    terminOrt: a === 'TERMIN_ANLEGEN' ? s.terminOrt : null,
    httpMethode: a === 'HTTP_ANFRAGE' ? s.httpMethode : null,
    httpUrl: a === 'HTTP_ANFRAGE' ? s.httpUrl.trim() : null,
    httpHeader:
      a === 'HTTP_ANFRAGE'
        ? s.httpHeader
            .filter((kopf) => kopf.name.trim() !== '')
            .map((kopf) => ({ name: kopf.name.trim(), wert: kopf.wert }))
        : null,
    httpRumpf:
      a === 'HTTP_ANFRAGE' &&
      s.httpMethode !== 'GET' &&
      s.httpMethode !== 'DELETE'
        ? s.httpRumpf
        : null,
    kanalDienst: a === 'KANAL_NACHRICHT' ? s.kanalDienst : null,
    kanalUrl: a === 'KANAL_NACHRICHT' ? s.kanalUrl.trim() : null,
    kanalText: a === 'KANAL_NACHRICHT' ? s.kanalText : null,
    kanalLink: a === 'KANAL_NACHRICHT' ? s.kanalLink : null,
  };
};

export const artDesErgebnisses = (
  schritt: Schritt,
  eigeneArt: Art | null,
): Art | null =>
  schritt.aktion === 'DATENSAETZE_SUCHEN'
    ? schritt.suchArt
    : schritt.aktion === 'ANLEGEN_ODER_AKTUALISIEREN'
      ? schritt.upsertArt
      : schritt.aktion === 'HTTP_ANFRAGE' ||
          schritt.aktion === 'KANAL_NACHRICHT' ||
          BRAUCHT_DATENSATZ.includes(schritt.aktion)
        ? eigeneArt
        : null;

const VARIABLEN_HINWEIS =
  'Variablen: {{ausloeser.name}}, {{ausloeser.felder.schluessel}}, {{schritt1.erster.email}}, {{schritt2.json.feld}} …';

export const SchrittFelder = ({
  nr,
  schritt,
  onChange,
  art,
  datensatz = false,
  frueher,
  reihumErlaubt,
  team,
  vorlagen,
}: {
  nr: number;
  schritt: Schritt;
  onChange: (neu: Schritt) => void;
  art: Art | null;
  datensatz?: boolean;
  frueher: { nr: number; art: Art | null; name: string }[];
  reihumErlaubt: boolean;
  team: Membership[];
  vorlagen: { id: string; name: string }[];
}) => {
  const stageLabel = useStageLabel();
  const setze = (teil: Partial<Schritt>) => onChange({ ...schritt, ...teil });
  const id = (feld: string) => `schritt-${String(nr)}-${feld}`;
  const a = schritt.aktion;

  const { data: felderData } = useQuery<{ customFields: CustomField[] }>(
    CUSTOM_FIELDS,
    { variables: { entity: art }, skip: art === null || a !== 'FELD_SETZEN' },
  );
  const { data: suchFelderData } = useQuery<{ customFields: CustomField[] }>(
    CUSTOM_FIELDS,
    {
      variables: { entity: schritt.suchArt },
      skip: a !== 'DATENSAETZE_SUCHEN',
    },
  );
  const setzbareEigene = (felderData?.customFields ?? []).filter(
    (f) => !f.eindeutig && f.type !== 'RELATION',
  );
  const suchFelder = [
    ...STANDARD_FILTER_FELDER[schritt.suchArt],
    ...(suchFelderData?.customFields ?? []).filter(
      (f) => f.type !== 'RELATION',
    ),
  ];
  const suchFeld = suchFelder.find((f) => f.key === schritt.suchFeld);

  const aktionen = (Object.keys(AKTION) as Aktion[]).filter(
    (key) =>
      (key !== 'VERANTWORTLICH_REIHUM' || reihumErlaubt) &&
      (key !== 'FELD_SETZEN' || art !== null) &&
      (!BRAUCHT_DATENSATZ.includes(key) ||
        art !== null ||
        datensatz ||
        frueher.some((f) => f.art !== null)),
  );

  const feldWertEingabe = () => {
    if (schritt.feldKey === 'std:stage') {
      return (
        <select
          id={id('feldwert')}
          required
          value={schritt.feldWert}
          onChange={(e) => setze({ feldWert: e.target.value })}
        >
          <option value="">—</option>
          {DEAL_STAGES.map((stage) => (
            <option key={stage} value={stage.toLowerCase()}>
              {stageLabel(stage)}
            </option>
          ))}
        </select>
      );
    }

    if (schritt.feldKey === 'std:ownerId') {
      return (
        <select
          id={id('feldwert')}
          value={schritt.feldWert}
          onChange={(e) => setze({ feldWert: e.target.value })}
        >
          <option value="">niemand</option>
          {team.map((m) => (
            <option key={m.user.id} value={m.user.id}>
              {m.user.firstName} {m.user.lastName}
            </option>
          ))}
        </select>
      );
    }

    const eigenesFeld = setzbareEigene.find((f) => f.key === schritt.feldKey);

    if (eigenesFeld?.type === 'SELECT') {
      return (
        <select
          id={id('feldwert')}
          value={schritt.feldWert}
          onChange={(e) => setze({ feldWert: e.target.value })}
        >
          <option value="">leer</option>
          {eigenesFeld.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        id={id('feldwert')}
        placeholder={
          eigenesFeld?.type === 'BOOLEAN'
            ? 'ja / nein'
            : 'leer lassen zum Leeren'
        }
        value={schritt.feldWert}
        onChange={(e) => setze({ feldWert: e.target.value })}
      />
    );
  };

  return (
    <fieldset className="automation-schritt">
      <legend>{nr === 1 ? 'dann' : `Schritt ${String(nr)}`}</legend>

      <div className="automation-form__satz">
        <div className="field">
          <label htmlFor={id('aktion')}>Aktion</label>
          <select
            id={id('aktion')}
            value={a}
            onChange={(e) => setze({ aktion: e.target.value as Aktion })}
          >
            {aktionen.map((key) => (
              <option key={key} value={key}>
                {AKTION[key]}
              </option>
            ))}
          </select>
        </div>

        {nr > 1 && BRAUCHT_DATENSATZ.includes(a) && (
          <div className="field">
            <label htmlFor={id('ziel')}>am Datensatz</label>
            <select
              id={id('ziel')}
              value={schritt.zielSchritt}
              onChange={(e) => setze({ zielSchritt: e.target.value })}
            >
              <option value="">
                {art === null && !datensatz && schritt.zielSchritt === ''
                  ? '— bitte wählen —'
                  : 'aus dem Auslöser'}
              </option>
              {frueher
                .filter((f) => f.art !== null)
                .map((f) => (
                  <option key={f.nr} value={String(f.nr)}>
                    aus Schritt {f.nr} ({f.name})
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      {a === 'VERANTWORTLICH_REIHUM' && (
        <fieldset className="field automation-form__reihe">
          <legend>Reihum an</legend>
          {team.map((m) => (
            <label key={m.user.id} className="checkbox-field">
              <input
                type="checkbox"
                checked={schritt.reihumUserIds.includes(m.user.id)}
                onChange={(e) =>
                  setze({
                    reihumUserIds: e.target.checked
                      ? [...schritt.reihumUserIds, m.user.id]
                      : schritt.reihumUserIds.filter((x) => x !== m.user.id),
                  })
                }
              />
              {m.user.firstName} {m.user.lastName}
            </label>
          ))}
          <p className="field__hint">
            In dieser Reihenfolge, dann wieder von vorn. Wer das Team verlässt,
            fällt von selbst heraus.
          </p>
        </fieldset>
      )}

      {(a === 'AUFGABE_ANLEGEN' ||
        a === 'NOTIZ_ANLEGEN' ||
        a === 'TERMIN_ANLEGEN') && (
        <div className="field">
          <label htmlFor={id('titel')}>
            {a === 'NOTIZ_ANLEGEN'
              ? 'Text der Notiz'
              : a === 'TERMIN_ANLEGEN'
                ? 'Titel des Termins'
                : 'Titel der Aufgabe'}
          </label>
          <input
            id={id('titel')}
            required
            maxLength={200}
            value={schritt.titel}
            onChange={(e) => setze({ titel: e.target.value })}
          />
          <p className="field__hint">{VARIABLEN_HINWEIS}</p>
        </div>
      )}

      {a === 'AUFGABE_ANLEGEN' && (
        <div className="automation-form__satz">
          <div className="field">
            <label htmlFor={id('wer')}>für</label>
            <select
              id={id('wer')}
              value={schritt.zustaendigUserId}
              onChange={(e) => setze({ zustaendigUserId: e.target.value })}
            >
              <option value="">den Verantwortlichen des Eintrags</option>
              {team.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.firstName} {m.user.lastName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={id('tage')}>fällig in Tagen</label>
            <input
              id={id('tage')}
              type="number"
              min={0}
              max={365}
              value={schritt.faelligInTagen}
              onChange={(e) => setze({ faelligInTagen: e.target.value })}
            />
          </div>
        </div>
      )}

      {a === 'TERMIN_ANLEGEN' && (
        <div className="automation-form__satz">
          <div className="field">
            <label htmlFor={id('termintage')}>in Tagen</label>
            <input
              id={id('termintage')}
              type="number"
              min={0}
              max={365}
              value={schritt.terminInTagen}
              onChange={(e) => setze({ terminInTagen: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={id('terminzeit')}>um</label>
            <input
              id={id('terminzeit')}
              type="time"
              required
              value={schritt.terminUhrzeit}
              onChange={(e) => setze({ terminUhrzeit: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={id('termindauer')}>Minuten</label>
            <input
              id={id('termindauer')}
              type="number"
              min={5}
              max={1440}
              value={schritt.terminDauer}
              onChange={(e) => setze({ terminDauer: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={id('terminort')}>Ort</label>
            <input
              id={id('terminort')}
              maxLength={300}
              value={schritt.terminOrt}
              onChange={(e) => setze({ terminOrt: e.target.value })}
            />
          </div>
        </div>
      )}

      {a === 'FELD_SETZEN' && art !== null && (
        <div className="automation-form__satz">
          <div className="field">
            <label htmlFor={id('feld')}>Feld</label>
            <select
              id={id('feld')}
              required
              value={schritt.feldKey}
              onChange={(e) => setze({ feldKey: e.target.value, feldWert: '' })}
            >
              <option value="">—</option>
              {SETZBAR[art].map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
              {setzbareEigene.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          {schritt.feldKey !== '' && (
            <div className="field">
              <label htmlFor={id('feldwert')}>auf</label>
              {feldWertEingabe()}
            </div>
          )}
        </div>
      )}

      {a === 'MAIL_SENDEN' && (
        <>
          <div className="field">
            <label htmlFor={id('mailan')}>an</label>
            <select
              id={id('mailan')}
              value={schritt.mailAn}
              onChange={(e) => setze({ mailAn: e.target.value as MailAn })}
            >
              <option value="VERANTWORTLICH">
                den Verantwortlichen (Benachrichtigung)
              </option>
              {(art === 'DEAL' || art === 'CONTACT') && (
                <option value="HAUPTKONTAKT">
                  den Kontakt (Vorlage aus dem eigenen Postfach)
                </option>
              )}
            </select>
          </div>
          {schritt.mailAn === 'HAUPTKONTAKT' ? (
            <div className="field">
              <label htmlFor={id('vorlage')}>Vorlage</label>
              <select
                id={id('vorlage')}
                required
                value={schritt.vorlageId}
                onChange={(e) => setze({ vorlageId: e.target.value })}
              >
                <option value="">—</option>
                {vorlagen.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <p className="field__hint">
                Geschickt wird aus dem Postfach des Verantwortlichen. Hat er
                keinen Postausgang eingerichtet, wird die Mail übersprungen und
                das im Protokoll vermerkt.
              </p>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={schritt.mailAlsEntwurf}
                  onChange={(e) => setze({ mailAlsEntwurf: e.target.checked })}
                />
                Erst als Entwurf zur Freigabe ablegen
              </label>
              <p className="field__hint">
                Dann geht nichts sofort hinaus: der Verantwortliche bekommt den
                fertigen Text unter Postfach → Entwürfe, eine Meldung in der
                Glocke, und schickt ihn selbst ab.
              </p>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor={id('betreff')}>Betreff</label>
                <input
                  id={id('betreff')}
                  required
                  maxLength={200}
                  value={schritt.titel}
                  onChange={(e) => setze({ titel: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor={id('mailtext')}>Text</label>
                <textarea
                  id={id('mailtext')}
                  rows={3}
                  maxLength={2000}
                  value={schritt.mailText}
                  onChange={(e) => setze({ mailText: e.target.value })}
                />
                <p className="field__hint">{VARIABLEN_HINWEIS}</p>
              </div>
            </>
          )}
        </>
      )}

      {a === 'DATENSAETZE_SUCHEN' && (
        <div className="automation-form__satz">
          <div className="field">
            <label htmlFor={id('sucharten')}>suche</label>
            <select
              id={id('sucharten')}
              value={schritt.suchArt}
              onChange={(e) =>
                setze({
                  suchArt: e.target.value as Art,
                  suchFeld: 'std:name',
                  suchVergleich: 'EQUALS',
                })
              }
            >
              <option value="CONTACT">Kontakte</option>
              <option value="COMPANY">Firmen</option>
              <option value="DEAL">Geschäfte</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={id('suchfeld')}>wo</label>
            <select
              id={id('suchfeld')}
              value={schritt.suchFeld}
              onChange={(e) => {
                const neu = suchFelder.find((f) => f.key === e.target.value);

                setze({
                  suchFeld: e.target.value,
                  suchVergleich:
                    neu === undefined
                      ? 'EQUALS'
                      : OPERATORS_FOR_TYPE[neu.type][0],
                });
              }}
            >
              {suchFelder.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={id('suchvergleich')}>Vergleich</label>
            <select
              id={id('suchvergleich')}
              value={schritt.suchVergleich}
              onChange={(e) =>
                setze({
                  suchVergleich: e.target.value as CustomFieldFilterOperator,
                })
              }
            >
              {(suchFeld === undefined
                ? (['EQUALS'] as CustomFieldFilterOperator[])
                : OPERATORS_FOR_TYPE[suchFeld.type]
              ).map((o) => (
                <option key={o} value={o}>
                  {CUSTOM_FILTER_OPERATOR_LABELS[o]}
                </option>
              ))}
            </select>
          </div>
          {!OPERATORS_WITHOUT_VALUE.includes(schritt.suchVergleich) && (
            <div className="field">
              <label htmlFor={id('suchwert')}>Wert</label>
              <input
                id={id('suchwert')}
                maxLength={500}
                placeholder="z. B. {{ausloeser.email}}"
                value={schritt.suchWert}
                onChange={(e) => setze({ suchWert: e.target.value })}
              />
            </div>
          )}
          <p className="field__hint">
            Ergibt bis zu zehn Treffer ({'{{'}schritt{nr}.anzahl{'}}'}, {'{{'}
            schritt{nr}.erster.name{'}}'}); spätere Schritte können am ersten
            Treffer arbeiten.
          </p>
        </div>
      )}

      {a === 'ANLEGEN_ODER_AKTUALISIEREN' && (
        <>
          <div className="field">
            <label htmlFor={id('upsertart')}>Art</label>
            <select
              id={id('upsertart')}
              value={schritt.upsertArt}
              onChange={(e) =>
                setze({ upsertArt: e.target.value as Art, upsertWerte: {} })
              }
            >
              <option value="CONTACT">Kontakt</option>
              <option value="COMPANY">Firma</option>
              <option value="DEAL">Geschäft</option>
            </select>
          </div>
          {UPSERT_FELDER[schritt.upsertArt].map(([feld, label]) => (
            <div className="field" key={feld}>
              <label htmlFor={id(`upsert-${feld}`)}>{label}</label>
              <input
                id={id(`upsert-${feld}`)}
                maxLength={500}
                value={schritt.upsertWerte[feld] ?? ''}
                onChange={(e) =>
                  setze({
                    upsertWerte: {
                      ...schritt.upsertWerte,
                      [feld]: e.target.value,
                    },
                  })
                }
              />
            </div>
          ))}
          <p className="field__hint">
            Gibt es den Datensatz schon, wird er ergänzt, sonst angelegt.{' '}
            {VARIABLEN_HINWEIS}
          </p>
        </>
      )}

      {a === 'KANAL_NACHRICHT' && (
        <>
          <div className="automation-form__satz">
            <div className="field">
              <label htmlFor={id('kanaldienst')}>Dienst</label>
              <select
                id={id('kanaldienst')}
                value={schritt.kanalDienst}
                onChange={(e) =>
                  setze({
                    kanalDienst: e.target.value as KanalDienst,
                    kanalGespeichert: null,
                  })
                }
              >
                {(Object.keys(KANAL_NAMEN) as KanalDienst[]).map((dienst) => (
                  <option key={dienst} value={dienst}>
                    {KANAL_NAMEN[dienst]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field automation-form__breit">
              <label htmlFor={id('kanalurl')}>Webhook-Adresse</label>
              <input
                id={id('kanalurl')}
                type="password"
                autoComplete="off"
                inputMode="url"
                maxLength={2000}
                required={schritt.kanalGespeichert === null}
                placeholder={
                  schritt.kanalGespeichert === null
                    ? 'https://…'
                    : `gespeichert (${schritt.kanalGespeichert}) – leer lassen behält sie`
                }
                aria-describedby={id('kanalurl-hinweis')}
                value={schritt.kanalUrl}
                onChange={(e) => setze({ kanalUrl: e.target.value })}
              />
              <p
                className="field__hint"
                id={id('kanalurl-hinweis')}
                role={
                  kanalHinweis(schritt.kanalDienst, schritt.kanalUrl) === null
                    ? undefined
                    : 'alert'
                }
              >
                {kanalHinweis(schritt.kanalDienst, schritt.kanalUrl) ??
                  KANAL_ANLEITUNG[schritt.kanalDienst]}
              </p>
            </div>
          </div>
          <div className="field">
            <label htmlFor={id('kanaltext')}>Text</label>
            <textarea
              id={id('kanaltext')}
              rows={3}
              required
              maxLength={4000}
              placeholder="Neues Geschäft: {{ausloeser.name}}"
              value={schritt.kanalText}
              onChange={(e) => setze({ kanalText: e.target.value })}
            />
            <p className="field__hint">{VARIABLEN_HINWEIS}</p>
          </div>
          {(art !== null || datensatz) && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={schritt.kanalLink}
                onChange={(e) => setze({ kanalLink: e.target.checked })}
              />
              Link zur Akte anhängen
            </label>
          )}
          <p className="field__hint">
            Die Adresse wird verschlüsselt gespeichert und nie wieder ganz
            angezeigt: wer sie kennt, kann in den Kanal schreiben. Im Probelauf
            geht nichts hinaus.
          </p>
        </>
      )}

      {a === 'HTTP_ANFRAGE' && (
        <>
          <div className="automation-form__satz">
            <div className="field">
              <label htmlFor={id('methode')}>Methode</label>
              <select
                id={id('methode')}
                value={schritt.httpMethode}
                onChange={(e) => setze({ httpMethode: e.target.value })}
              >
                {['POST', 'GET', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="field automation-form__breit">
              <label htmlFor={id('url')}>Adresse</label>
              <input
                id={id('url')}
                required
                type="text"
                inputMode="url"
                maxLength={2000}
                placeholder="https://…"
                value={schritt.httpUrl}
                onChange={(e) => setze({ httpUrl: e.target.value })}
              />
            </div>
          </div>
          <fieldset className="field">
            <legend>Köpfe</legend>
            {schritt.httpHeader.map((kopf, index) => (
              <div className="automation-bedingung" key={index}>
                <input
                  aria-label="Name des Kopfs"
                  placeholder="Authorization"
                  maxLength={60}
                  value={kopf.name}
                  onChange={(e) =>
                    setze({
                      httpHeader: schritt.httpHeader.map((k, i) =>
                        i === index
                          ? { ...k, name: e.target.value, gespeichert: false }
                          : k,
                      ),
                    })
                  }
                />
                <input
                  aria-label="Wert des Kopfs"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    kopf.gespeichert === true
                      ? 'gespeichert – leer lassen behält ihn'
                      : 'Wert (wird verschlüsselt gespeichert)'
                  }
                  maxLength={2000}
                  value={kopf.wert}
                  onChange={(e) =>
                    setze({
                      httpHeader: schritt.httpHeader.map((k, i) =>
                        i === index ? { ...k, wert: e.target.value } : k,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="button button--ghost button--small"
                  onClick={() =>
                    setze({
                      httpHeader: schritt.httpHeader.filter(
                        (_k, i) => i !== index,
                      ),
                    })
                  }
                >
                  Entfernen
                </button>
              </div>
            ))}
            {schritt.httpHeader.length < 10 && (
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() =>
                  setze({
                    httpHeader: [...schritt.httpHeader, { name: '', wert: '' }],
                  })
                }
              >
                Kopf hinzufügen
              </button>
            )}
          </fieldset>
          {schritt.httpMethode !== 'GET' &&
            schritt.httpMethode !== 'DELETE' && (
              <div className="field">
                <label htmlFor={id('rumpf')}>Inhalt (JSON)</label>
                <textarea
                  id={id('rumpf')}
                  rows={4}
                  maxLength={10_000}
                  placeholder='{"name": "{{ausloeser.name}}"}'
                  value={schritt.httpRumpf}
                  onChange={(e) => setze({ httpRumpf: e.target.value })}
                />
              </div>
            )}
          <p className="field__hint">
            Nur öffentliche https-Adressen, höchstens 10 Sekunden. Die Antwort
            steht als {'{{'}schritt{nr}.status{'}}'} und {'{{'}schritt{nr}
            .json.feld{'}}'} den nächsten Schritten zur Verfügung. Werte der
            Köpfe erscheinen nie im Protokoll.
          </p>
        </>
      )}
    </fieldset>
  );
};

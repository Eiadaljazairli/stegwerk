import { useQuery } from '@apollo/client';
import { type ReactNode, useId, useState } from 'react';

import {
  type Abschnitt,
  abschnitteBilden,
  anzahlLeere,
  istEingeklappt,
  leereSichtbar,
  merkeEingeklappt,
  merkeLeereSichtbar,
} from '../lib/feldgruppen';
import { CUSTOM_FIELD_GROUPS, CUSTOM_FIELDS } from '../lib/queries';
import { type FeldArt, useFeldrechte } from '../lib/useFeldrechte';
import {
  type CustomField,
  type CustomFieldGroup,
  type CustomFieldValues,
  formatBetrag,
} from '../lib/types';
import { customFieldAnzeige, linkZiel, OptionChip } from './CustomFieldWert';
import { EditableField } from './EditableField';
import { useFeldHinweis } from './FeldHinweis';
import { AdresseFeld, LinksFeld } from './ZusammengesetzteFelder';
import { IconStar } from './Icons';
import { GegenfeldBereich, VerweisFeld } from './Verweise';

type CustomFieldsSectionProps = {
  entity: CustomField['entity'];
  datensatzId?: string;
  values: CustomFieldValues;
  onSave: (key: string, value: string) => void | Promise<unknown>;
};

const INPUT_TYPE: Record<
  CustomField['type'],
  'text' | 'number' | 'date' | 'email' | 'select' | 'boolean'
> = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
  BOOLEAN: 'boolean',
  SELECT: 'select',
  MULTI_SELECT: 'select',
  CURRENCY: 'number',
  URL: 'text',
  EMAIL: 'email',
  PHONE: 'text',
  RATING: 'number',
  ADDRESS: 'text',
  LINKS: 'text',
  RELATION: 'text',
};

const MehrfachAuswahl = ({
  field,
  value,
  onSave,
}: {
  field: CustomField;
  value: unknown;
  onSave: (value: string) => void | Promise<unknown>;
}) => {
  const gewaehlt = Array.isArray(value) ? value.map(String) : [];
  const hinweis = useFeldHinweis(field.label, field.beschreibung);

  const umschalten = (option: string) => {
    const neu = gewaehlt.includes(option)
      ? gewaehlt.filter((entry) => entry !== option)
      : [...gewaehlt, option];

    void Promise.resolve(onSave(neu.join(';'))).catch(() => null);
  };

  return (
    <div className="detail-field">
      <div className="detail-field__label">
        {field.label}
        {field.required && <span className="detail-field__required">*</span>}
        {hinweis.knopf}
      </div>
      {hinweis.text}
      <div
        className="detail-field__value detail-field__value--static option-toggles"
        role="group"
        aria-label={field.label}
        aria-describedby={hinweis.beschreibtId}
      >
        {field.options.map((option) => (
          <button
            key={option}
            type="button"
            className={
              gewaehlt.includes(option)
                ? 'option-toggle option-toggle--an'
                : 'option-toggle'
            }
            aria-pressed={gewaehlt.includes(option)}
            onClick={() => umschalten(option)}
          >
            <OptionChip field={field} option={option} />
          </button>
        ))}
      </div>
    </div>
  );
};

const SterneWahl = ({
  field,
  value,
  onSave,
}: {
  field: CustomField;
  value: unknown;
  onSave: (value: string) => void | Promise<unknown>;
}) => {
  const wert = typeof value === 'number' ? value : 0;
  const hinweis = useFeldHinweis(field.label, field.beschreibung);

  return (
    <div className="detail-field">
      <div className="detail-field__label">
        {field.label}
        {field.required && <span className="detail-field__required">*</span>}
        {hinweis.knopf}
      </div>
      {hinweis.text}
      <div
        className="detail-field__value detail-field__value--static sterne sterne--wahl"
        role="group"
        aria-label={field.label}
        aria-describedby={hinweis.beschreibtId}
      >
        {[1, 2, 3, 4, 5].map((stern) => (
          <button
            key={stern}
            type="button"
            className={stern <= wert ? 'sterne__an' : 'sterne__aus'}
            aria-label={`${String(stern)} von 5 Sternen`}
            aria-pressed={stern === wert}
            onClick={() =>
              void Promise.resolve(
                onSave(stern === wert && !field.required ? '' : String(stern)),
              ).catch(() => null)
            }
          >
            <IconStar filled size={16} />
          </button>
        ))}
      </div>
    </div>
  );
};

const NurLesen = ({
  field,
  value,
}: {
  field: CustomField;
  value: CustomFieldValues[string] | null;
}) => {
  const hinweis = useFeldHinweis(field.label, field.beschreibung);

  return (
    <div className="detail-field">
      <div className="detail-field__label">
        {field.label}
        {hinweis.knopf}
      </div>
      {hinweis.text}
      <div
        className="detail-field__value detail-field__value--static"
        title="Ihre Rolle darf dieses Feld nicht ändern."
        aria-describedby={hinweis.beschreibtId}
      >
        {value === null ? (
          <span className="detail-field__empty">—</span>
        ) : (
          customFieldAnzeige(field, value)
        )}
      </div>
    </div>
  );
};

const FeldEintrag = ({
  field,
  value,
  nurLesen,
  onSave,
}: {
  field: CustomField;
  value: CustomFieldValues[string] | null;
  nurLesen: boolean;
  onSave: (value: string) => void | Promise<unknown>;
}) => {
  if (field.type === 'RELATION') {
    return (
      <VerweisFeld
        field={field}
        value={value}
        nurLesen={nurLesen}
        onSave={onSave}
      />
    );
  }

  if (nurLesen) {
    return <NurLesen field={field} value={value} />;
  }

  if (field.type === 'MULTI_SELECT') {
    return <MehrfachAuswahl field={field} value={value} onSave={onSave} />;
  }

  if (field.type === 'ADDRESS' || field.type === 'LINKS') {
    const Feld = field.type === 'ADDRESS' ? AdresseFeld : LinksFeld;

    return (
      <Feld
        label={field.label}
        required={field.required}
        hinweis={field.beschreibung}
        value={value}
        onSave={onSave}
      />
    );
  }

  if (field.type === 'RATING') {
    return <SterneWahl field={field} value={value} onSave={onSave} />;
  }

  const ziel = linkZiel(field, value);

  return (
    <EditableField
      label={field.label}
      hinweis={field.beschreibung}
      value={
        Array.isArray(value)
          ? value.join('; ')
          : typeof value === 'object'
            ? null
            : value
      }
      type={INPUT_TYPE[field.type]}
      options={field.options}
      required={field.required}
      format={
        field.type === 'SELECT' ||
        field.type === 'NUMBER' ||
        field.type === 'DATE'
          ? (raw) =>
              customFieldAnzeige(
                field,
                field.type === 'NUMBER' ? Number(raw) : raw,
              )
          : field.type === 'CURRENCY'
            ? (raw) => formatBetrag(Number(raw), field.waehrung ?? 'EUR')
            : undefined
      }
      aktion={
        ziel === null ? undefined : (
          <a
            className="detail-field__link"
            href={ziel}
            {...(field.type === 'URL'
              ? { target: '_blank', rel: 'noreferrer noopener' }
              : {})}
          >
            {field.type === 'URL'
              ? 'Öffnen'
              : field.type === 'EMAIL'
                ? 'E-Mail schreiben'
                : 'Anrufen'}
          </a>
        )
      }
      onSave={onSave}
    />
  );
};

const AbschnittBlock = ({
  abschnitt,
  entity,
  mitKopf,
  zeichne,
}: {
  abschnitt: Abschnitt;
  entity: CustomField['entity'];
  mitKopf: boolean;
  zeichne: (field: CustomField) => ReactNode;
}) => {
  const id = useId();
  const [gewaehlt, setGewaehlt] = useState<boolean | null>(null);
  const zu = mitKopf && (gewaehlt ?? istEingeklappt(abschnitt, entity));

  if (abschnitt.felder.length === 0) {
    return null;
  }

  const grid = (
    <div id={id} className="card detail-grid" hidden={zu}>
      {abschnitt.felder.map(zeichne)}
    </div>
  );

  if (!mitKopf) {
    return grid;
  }

  return (
    <div className="feld-abschnitt">
      <h3 className="feld-abschnitt__kopf">
        <button
          type="button"
          className="feld-abschnitt__schalter"
          aria-expanded={!zu}
          aria-controls={id}
          onClick={() => {
            merkeEingeklappt(abschnitt.id, entity, !zu);
            setGewaehlt(!zu);
          }}
        >
          <span className="feld-abschnitt__pfeil" aria-hidden="true">
            {zu ? '▸' : '▾'}
          </span>
          {abschnitt.name}
          <span className="feld-abschnitt__anzahl">
            {abschnitt.felder.length}
          </span>
        </button>
      </h3>
      {grid}
    </div>
  );
};

export const CustomFieldsSection = ({
  entity,
  datensatzId,
  values,
  onSave,
}: CustomFieldsSectionProps) => {
  const { data } = useQuery<{ customFields: CustomField[] }>(CUSTOM_FIELDS, {
    variables: { entity },
  });
  const { data: gruppenDaten } = useQuery<{
    customFieldGroups: CustomFieldGroup[];
  }>(CUSTOM_FIELD_GROUPS, { variables: { entity } });
  const [leereZeigen, setLeereZeigen] = useState(() => leereSichtbar(entity));

  const feldrechte = useFeldrechte();
  const art = entity.toLowerCase() as FeldArt;
  const sichtbar = (data?.customFields ?? []).filter(
    (field) => feldrechte.eigenes(art, field.key) !== 'verborgen',
  );
  const fields = sichtbar.filter((field) => field.gegenseite !== true);
  const gegenfelder =
    datensatzId === undefined
      ? []
      : sichtbar.filter((field) => field.gegenseite === true);

  if (fields.length === 0 && gegenfelder.length === 0) {
    return null;
  }

  const gruppen = gruppenDaten?.customFieldGroups ?? [];
  const abschnitte = abschnitteBilden(fields, gruppen, values, leereZeigen);
  const leere = anzahlLeere(abschnitte);
  const mitKopf = abschnitte.some((abschnitt) => abschnitt.id !== null);
  const leerInsgesamt = anzahlLeere(
    abschnitteBilden(fields, gruppen, values, false),
  );

  const zeichne = (field: CustomField) => (
    <FeldEintrag
      key={field.id}
      field={field}
      value={values[field.key] ?? null}
      nurLesen={feldrechte.eigenes(art, field.key) === 'lesen'}
      onSave={(next) => onSave(field.key, next)}
    />
  );

  const umschalten = () => {
    merkeLeereSichtbar(entity, !leereZeigen);
    setLeereZeigen(!leereZeigen);
  };

  return (
    <section className="detail-section">
      <h2>Eigene Felder</h2>

      {abschnitte.map((abschnitt) => (
        <AbschnittBlock
          key={abschnitt.id ?? 'ohne'}
          abschnitt={abschnitt}
          entity={entity}
          mitKopf={mitKopf}
          zeichne={zeichne}
        />
      ))}

      {datensatzId !== undefined && gegenfelder.length > 0 && (
        <GegenfeldBereich
          entity={entity}
          id={datensatzId}
          felder={gegenfelder}
        />
      )}

      {leerInsgesamt > 0 && (
        <button
          type="button"
          className="link-button feld-leere__schalter"
          onClick={umschalten}
        >
          {leereZeigen
            ? 'Leere Felder ausblenden'
            : leere === 1
              ? '1 leeres Feld anzeigen'
              : `${String(leere)} leere Felder anzeigen`}
        </button>
      )}
    </section>
  );
};

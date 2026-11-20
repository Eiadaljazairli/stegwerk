import { useState } from 'react';

import { type TaxExemption } from '../lib/types';

export const STEUERBEFREIUNGEN: {
  wert: TaxExemption;
  bezeichnung: string;
  ustIdNoetig: boolean;
}[] = [
  {
    wert: 'REVERSE_CHARGE',
    bezeichnung: 'Reverse Charge im Inland (§ 13b UStG, z. B. Bauleistung)',
    ustIdNoetig: true,
  },
  {
    wert: 'REVERSE_CHARGE_EU',
    bezeichnung: 'Reverse Charge, Leistung an Unternehmer im EU-Ausland',
    ustIdNoetig: true,
  },
  {
    wert: 'INNERGEMEINSCHAFTLICH',
    bezeichnung: 'Innergemeinschaftliche Lieferung (§ 4 Nr. 1b, § 6a UStG)',
    ustIdNoetig: true,
  },
  {
    wert: 'AUSFUHR',
    bezeichnung: 'Ausfuhr ins Drittland (§ 4 Nr. 1a, § 6 UStG)',
    ustIdNoetig: false,
  },
  {
    wert: 'STEUERFREI',
    bezeichnung: 'Sonstiger steuerfreier Umsatz (Rechtsgrundlage angeben)',
    ustIdNoetig: false,
  },
  {
    wert: 'NULLSATZ',
    bezeichnung: 'Nullsteuersatz (§ 12 Abs. 3 UStG, z. B. Photovoltaik)',
    ustIdNoetig: false,
  },
];

export type Befreiungswerte = {
  taxExemption: TaxExemption | null;
  taxExemptionNote: string | null;
  recipientVatId: string | null;
};

const Feld = ({
  id,
  label,
  wert,
  maxLength,
  disabled,
  placeholder,
  onCommit,
}: {
  id: string;
  label: string;
  wert: string;
  maxLength: number;
  disabled: boolean;
  placeholder?: string;
  onCommit: (next: string) => void;
}) => {
  const [entwurf, setEntwurf] = useState(wert);
  const [tippt, setTippt] = useState(false);

  if (!tippt && entwurf !== wert) {
    setEntwurf(wert);
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={entwurf}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setTippt(true)}
        onChange={(event) => setEntwurf(event.target.value)}
        onBlur={() => {
          setTippt(false);

          if (entwurf !== wert) {
            onCommit(entwurf);
          }
        }}
      />
    </div>
  );
};

export const SteuerbefreiungFelder = ({
  idPrefix,
  werte,
  smallBusiness,
  hatNullProzent,
  disabled,
  onSave,
}: {
  idPrefix: string;
  werte: Befreiungswerte;
  smallBusiness: boolean;
  hatNullProzent: boolean;
  disabled: boolean;
  onSave: (teil: Partial<Befreiungswerte>) => void;
}) => {
  if (smallBusiness) {
    return (
      <p className="field__hint">
        Kleinunternehmer nach § 19 UStG: keine Umsatzsteuer auf allen
        Positionen, ein Befreiungsgrund ist nicht nötig.
      </p>
    );
  }

  const gewaehlt = STEUERBEFREIUNGEN.find(
    (eintrag) => eintrag.wert === werte.taxExemption,
  );

  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-steuerbefreiung`}>
          Steuerbefreiung für Positionen mit 0 %
        </label>
        <select
          id={`${idPrefix}-steuerbefreiung`}
          disabled={disabled}
          value={werte.taxExemption ?? ''}
          onChange={(event) =>
            onSave({
              taxExemption:
                event.target.value === ''
                  ? null
                  : (event.target.value as TaxExemption),
            })
          }
        >
          <option value="">— keine —</option>
          {STEUERBEFREIUNGEN.map((eintrag) => (
            <option key={eintrag.wert} value={eintrag.wert}>
              {eintrag.bezeichnung}
            </option>
          ))}
        </select>
        {hatNullProzent && werte.taxExemption === null && (
          <p className="notice">
            Positionen mit 0 % brauchen einen Grund (§ 14 Abs. 4 Nr. 8 UStG).
            Ohne ihn lässt sich die Rechnung nicht stellen.
          </p>
        )}
      </div>

      {werte.taxExemption === 'STEUERFREI' && (
        <Feld
          id={`${idPrefix}-steuerbefreiung-grund`}
          label="Rechtsgrundlage"
          wert={werte.taxExemptionNote ?? ''}
          maxLength={300}
          disabled={disabled}
          placeholder="z. B. § 4 Nr. 14 UStG"
          onCommit={(next) => onSave({ taxExemptionNote: next })}
        />
      )}

      {(gewaehlt?.ustIdNoetig === true || werte.recipientVatId !== null) && (
        <Feld
          id={`${idPrefix}-ustid-empfaenger`}
          label="USt-IdNr. des Kunden"
          wert={werte.recipientVatId ?? ''}
          maxLength={30}
          disabled={disabled}
          placeholder="z. B. ATU12345678"
          onCommit={(next) => onSave({ recipientVatId: next })}
        />
      )}
    </>
  );
};

import { type ReactNode } from 'react';

import {
  adresseZeilen,
  datumText,
  istAdresse,
  istLinkListe,
  linkAnzeige,
  zahlText,
} from '../lib/feldformat';
import { type CustomField, formatBetrag, optionFarbe } from '../lib/types';
import { IconStar } from './Icons';
import { VerweisChips } from './Verweise';

export const OptionChip = ({
  field,
  option,
}: {
  field: CustomField;
  option: string;
}) => (
  <span className={`option-chip option-chip--${optionFarbe(field, option)}`}>
    {option}
  </span>
);

export const Sterne = ({ wert }: { wert: number }) => (
  <span className="sterne" aria-label={`${String(wert)} von 5 Sternen`}>
    {[1, 2, 3, 4, 5].map((stern) => (
      <span
        key={stern}
        aria-hidden="true"
        className={stern <= wert ? 'sterne__an' : 'sterne__aus'}
      >
        <IconStar filled size={14} />
      </span>
    ))}
  </span>
);

export const linkZiel = (field: CustomField, value: unknown): string | null => {
  if (typeof value !== 'string' || value === '') {
    return null;
  }

  switch (field.type) {
    case 'URL':
      return value.startsWith('https://') ? value : null;
    case 'EMAIL':
      return `mailto:${value}`;
    case 'PHONE':
      return `tel:${value}`;
    default:
      return null;
  }
};

export const customFieldAnzeige = (
  field: CustomField,
  value: unknown,
): ReactNode => {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return '—';
  }

  switch (field.type) {
    case 'BOOLEAN':
      return value === true ? 'Ja' : 'Nein';

    case 'NUMBER':
      return typeof value === 'number' ? zahlText(field, value) : String(value);

    case 'DATE':
      return typeof value === 'string' ? (
        <span title={value.slice(0, 10).split('-').reverse().join('.')}>
          {datumText(field, value)}
        </span>
      ) : (
        String(value)
      );

    case 'ADDRESS':
      return istAdresse(value) ? (
        <span className="adresse-wert">
          {adresseZeilen(value).map((zeile) => (
            <span key={zeile}>{zeile}</span>
          ))}
        </span>
      ) : (
        '—'
      );

    case 'LINKS':
      return istLinkListe(value) ? (
        <span className="link-liste">
          {value.map((link) => {
            const { text, ziel } = linkAnzeige(link);

            return ziel === null ? (
              <span key={link.url}>{text}</span>
            ) : (
              <a
                key={link.url}
                href={ziel}
                target="_blank"
                rel="noreferrer noopener"
              >
                {text}
              </a>
            );
          })}
        </span>
      ) : (
        '—'
      );

    case 'CURRENCY':
      return typeof value === 'number'
        ? formatBetrag(value, field.waehrung ?? 'EUR')
        : String(value);

    case 'RATING':
      return typeof value === 'number' ? <Sterne wert={value} /> : '—';

    case 'SELECT':
      return <OptionChip field={field} option={String(value)} />;

    case 'MULTI_SELECT':
      return (
        <span className="option-chips">
          {(Array.isArray(value) ? value : [String(value)]).map((option) => (
            <OptionChip key={option} field={field} option={String(option)} />
          ))}
        </span>
      );

    case 'URL': {
      const ziel = linkZiel(field, value);

      return ziel === null ? (
        String(value)
      ) : (
        <a href={ziel} target="_blank" rel="noreferrer noopener">
          {String(value).replace(/^https:\/\//, '')}
        </a>
      );
    }

    case 'EMAIL':
    case 'PHONE': {
      const ziel = linkZiel(field, value);

      return ziel === null ? String(value) : <a href={ziel}>{String(value)}</a>;
    }

    case 'RELATION':
      return <VerweisChips art={field.zielEntity} wert={value} />;

    default:
      return String(value);
  }
};

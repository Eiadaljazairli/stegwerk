import {
  type CustomField,
  type CustomFieldFilter,
  type CustomFieldFilterOperator,
  OPERATORS_WITHOUT_VALUE,
  TAGE_OPERATOREN,
} from './types';
import { leseZahl } from './zahl';

export type FormularStand = {
  operator: CustomFieldFilterOperator;
  value: string;
  mehrere: string[];
};

const istZahlFeld = (typ: CustomField['type']) =>
  typ === 'NUMBER' || typ === 'CURRENCY';

export const standPruefen = (
  typ: CustomField['type'],
  stand: FormularStand,
): { braucht: boolean; ok: boolean } => {
  const braucht = !OPERATORS_WITHOUT_VALUE.includes(stand.operator);

  if (!braucht) {
    return { braucht, ok: true };
  }

  if (typ === 'MULTI_SELECT') {
    return { braucht, ok: stand.mehrere.length > 0 };
  }

  if (stand.value.trim() === '') {
    return { braucht, ok: false };
  }

  const nachTagen = TAGE_OPERATOREN.includes(stand.operator);

  return {
    braucht,
    ok: nachTagen || !istZahlFeld(typ) || leseZahl(stand.value) != null,
  };
};

export const filterAusStand = (
  key: string,
  typ: CustomField['type'],
  stand: FormularStand,
  gruppe?: number,
): CustomFieldFilter | null => {
  const { braucht, ok } = standPruefen(typ, stand);

  if (!ok) {
    return null;
  }

  const nachTagen = TAGE_OPERATOREN.includes(stand.operator);
  const zahl =
    braucht && !nachTagen && istZahlFeld(typ) ? leseZahl(stand.value) : null;

  return {
    ...(gruppe === undefined ? {} : { gruppe }),
    key,
    operator: stand.operator,
    ...(braucht
      ? {
          value:
            typ === 'MULTI_SELECT'
              ? JSON.stringify(stand.mehrere)
              : zahl !== null && zahl !== undefined
                ? String(zahl)
                : stand.value.trim(),
        }
      : {}),
  };
};

export const standAusFilter = (
  filter: CustomFieldFilter,
  typ: CustomField['type'],
): FormularStand => {
  const roh = filter.value ?? '';

  if (typ === 'MULTI_SELECT') {
    try {
      const liste: unknown = JSON.parse(roh);

      return {
        operator: filter.operator,
        value: '',
        mehrere: Array.isArray(liste) ? liste.map(String) : [],
      };
    } catch {
      return { operator: filter.operator, value: '', mehrere: [] };
    }
  }

  return {
    operator: filter.operator,
    value:
      istZahlFeld(typ) && !TAGE_OPERATOREN.includes(filter.operator)
        ? roh.replace('.', ',')
        : roh,
    mehrere: [],
  };
};

export const filterErsetzen = (
  alle: CustomFieldFilter[],
  index: number,
  neu: CustomFieldFilter,
): CustomFieldFilter[] =>
  alle.map((eintrag, stelle) => {
    if (stelle !== index) {
      return eintrag;
    }

    const ohneGruppe: CustomFieldFilter = { ...neu };

    delete ohneGruppe.gruppe;

    return eintrag.gruppe === undefined
      ? ohneGruppe
      : { ...ohneGruppe, gruppe: eintrag.gruppe };
  });

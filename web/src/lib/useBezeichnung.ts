import { useQuery } from '@apollo/client';

import {
  type Bezeichnung,
  bezeichnungenAus,
  form,
  type Form,
  leerText,
  type ObjektArt,
  type ObjektBezeichnung,
  seitenName,
} from './bezeichnung';
import { OBJEKT_BEZEICHNUNGEN } from './queries';

export const useBezeichnungen = (): Record<ObjektArt, Bezeichnung> => {
  const { data } = useQuery<{ objektBezeichnungen: ObjektBezeichnung[] }>(
    OBJEKT_BEZEICHNUNGEN,
  );

  return bezeichnungenAus(data?.objektBezeichnungen);
};

export const useBezeichnung = () => {
  const bezeichnungen = useBezeichnungen();

  return Object.assign(
    (art: ObjektArt, welche: Form = 'einzahl'): string =>
      form(bezeichnungen[art], welche),
    {
      leer: (art: ObjektArt, standardText: string, mitImport = false) =>
        leerText(bezeichnungen[art], art, standardText, mitImport),
    },
  );
};

export const useSeitenName = () => {
  const bezeichnungen = useBezeichnungen();

  return (tab: { to: string; label: string }): string =>
    seitenName(bezeichnungen, tab.to, tab.label);
};

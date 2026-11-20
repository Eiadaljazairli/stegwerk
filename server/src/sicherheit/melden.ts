import { EventEmitter } from 'node:events';

import { getRequestContext } from '../observability/request-context';

export type SicherheitsArt =
  | 'anmeldung'
  | 'anmeldung_fehlgeschlagen'
  | 'zweiter_faktor_falsch'
  | 'zwei_faktor_an'
  | 'zwei_faktor_aus'
  | 'passwort_zurueckgesetzt'
  | 'passwort_geaendert'
  | 'zwei_faktor_pflicht'
  | 'sitzung_beendet'
  | 'andere_sitzungen_beendet'
  | 'einladung'
  | 'mitglied_entfernt'
  | 'rolle_geaendert'
  | 'schluessel_angelegt'
  | 'schluessel_widerrufen'
  | 'schluessel_modus'
  | 'export'
  | 'datenexport'
  | 'avv_angenommen'
  | 'email_geaendert'
  | 'konto_geloescht'
  | 'zwei_faktor_zurueckgesetzt'
  | 'papierkorb_frist'
  | 'leerlauf_abmeldung'
  | 'einladungs_domains'
  | 'konto_gesperrt'
  | 'mcp_verbunden'
  | 'mcp_aenderung'
  | 'mcp_vorschlag'
  | 'ki_vorschlag_angenommen'
  | 'ki_vorschlag_verworfen'
  | 'automation_angelegt'
  | 'automation_geaendert'
  | 'automation_geloescht'
  | 'automation_eingang_erneuert'
  | 'buchhaltung_verbunden'
  | 'buchhaltung_getrennt'
  | 'buchhaltung_eingestellt'
  | 'sso_verknuepft'
  | 'sso_getrennt'
  | 'ki_eingerichtet'
  | 'ki_entfernt'
  | 'objekt_bezeichnung';

export type SicherheitsMeldung = {
  art: SicherheitsArt;
  userId?: string | null;
  workspaceId?: string | null;
  actorId?: string | null;
  details?: Record<string, string | number | boolean | null>;
  geraet?: string | null;
  ipGekuerzt?: string | null;
};

const kanal = new EventEmitter();

export const meldeSicherheit = (meldung: SicherheitsMeldung): void => {
  const kontext = getRequestContext();

  kanal.emit('ereignis', {
    ...meldung,
    actorId:
      meldung.actorId !== undefined
        ? meldung.actorId
        : (kontext?.userId ?? null),
    geraet: meldung.geraet ?? kontext?.geraet ?? null,
    ipGekuerzt: meldung.ipGekuerzt ?? kontext?.ipGekuerzt ?? null,
  } satisfies SicherheitsMeldung);
};

export const hoereSicherheit = (
  hoerer: (meldung: SicherheitsMeldung) => void,
): (() => void) => {
  kanal.on('ereignis', hoerer);

  return () => kanal.off('ereignis', hoerer);
};

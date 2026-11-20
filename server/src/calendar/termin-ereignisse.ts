import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';

export type TerminEreignis = {
  art: 'geaendert' | 'geloescht';
  workspaceId: string;
  terminId: string;
  ownerId?: string;
  serieId?: string | null;
  abgesagt?: boolean;
};

export type KalenderAntwort = {
  workspaceId: string;
  von: string;
  ics: string;
};

const kanal = new EventEmitter();
kanal.setMaxListeners(20);

const abgleich = new AsyncLocalStorage<true>();

export const imKalenderabgleich = <T>(arbeit: () => Promise<T>): Promise<T> =>
  abgleich.run(true, arbeit);

export const laeuftKalenderabgleich = (): boolean =>
  abgleich.getStore() === true;

export const meldeTermin = (ereignis: TerminEreignis): void => {
  if (laeuftKalenderabgleich()) {
    return;
  }

  kanal.emit('termin', ereignis);
};

export const hoereTermin = (
  zuhoerer: (ereignis: TerminEreignis) => void,
): (() => void) => {
  kanal.on('termin', zuhoerer);

  return () => kanal.off('termin', zuhoerer);
};

export const meldeKalenderAntwort = (antwort: KalenderAntwort): void => {
  kanal.emit('antwort', antwort);
};

export const hoereKalenderAntwort = (
  zuhoerer: (antwort: KalenderAntwort) => void,
): (() => void) => {
  kanal.on('antwort', zuhoerer);

  return () => kanal.off('antwort', zuhoerer);
};

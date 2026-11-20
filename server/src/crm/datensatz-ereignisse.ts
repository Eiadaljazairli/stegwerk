import { EventEmitter } from 'node:events';

import { nachDemSpeichern } from '../webhooks/ereignisse';

export type DatensatzAenderung = {
  workspaceId: string;
  entitaet: string;
  id: string;
  neu: boolean;
  felder: string[];
};

const kanal = new EventEmitter();

kanal.setMaxListeners(50);

export const meldeAenderung = (aenderung: DatensatzAenderung): void => {
  nachDemSpeichern(() => kanal.emit('aenderung', aenderung));
};

export const hoereAufAenderungen = (
  zuhoerer: (aenderung: DatensatzAenderung) => void,
): (() => void) => {
  kanal.on('aenderung', zuhoerer);

  return () => {
    kanal.off('aenderung', zuhoerer);
  };
};

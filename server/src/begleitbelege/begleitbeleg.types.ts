import { registerEnumType } from '@nestjs/graphql';

export enum BegleitbelegArt {
  AUFTRAGSBESTAETIGUNG = 'auftragsbestaetigung',
  LIEFERSCHEIN = 'lieferschein',
}

registerEnumType(BegleitbelegArt, { name: 'BegleitbelegArt' });

export enum BegleitbelegStatus {
  GESTELLT = 'gestellt',
  STORNIERT = 'storniert',
}

registerEnumType(BegleitbelegStatus, { name: 'BegleitbelegStatus' });

export const ART_TEXT: Record<
  BegleitbelegArt,
  { label: string; kuerzel: string; datei: string }
> = {
  [BegleitbelegArt.AUFTRAGSBESTAETIGUNG]: {
    label: 'Auftragsbestätigung',
    kuerzel: 'AB',
    datei: 'Auftragsbestaetigung',
  },
  [BegleitbelegArt.LIEFERSCHEIN]: {
    label: 'Lieferschein',
    kuerzel: 'LS',
    datei: 'Lieferschein',
  },
};

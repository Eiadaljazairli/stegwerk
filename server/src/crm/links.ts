import { BadRequestException } from '@nestjs/common';

import { httpsLink, WertFehler } from '../custom-fields/zusammengesetzt';

export const httpsOderNull = (
  wert: string | null,
  bezeichnung: string,
): string | null => {
  if (wert === null || wert.trim() === '') {
    return null;
  }

  try {
    return httpsLink(wert);
  } catch (error) {
    if (error instanceof WertFehler) {
      throw new BadRequestException(`${bezeichnung}: ${error.message}`);
    }

    throw error;
  }
};

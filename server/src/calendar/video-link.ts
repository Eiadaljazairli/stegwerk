import { BadRequestException } from '@nestjs/common';

export const VIDEO_LINK_MAX = 500;

export const pruefeVideoLink = (
  roh: string | null | undefined,
): string | null => {
  const wert = roh?.trim() ?? '';

  if (wert === '') {
    return null;
  }

  let url: URL;

  try {
    url = new URL(wert);
  } catch {
    throw new BadRequestException('Der Videolink ist keine gültige Adresse.');
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname === '' ||
    url.username !== '' ||
    url.password !== '' ||
    wert.length > VIDEO_LINK_MAX ||
    /[\s\u0000-\u001f\u007f"<>]/u.test(wert)
  ) {
    throw new BadRequestException(
      'Der Videolink muss mit https:// beginnen, darf keine Zugangsdaten enthalten und höchstens 500 Zeichen lang sein.',
    );
  }

  return wert;
};

export const videoLinkOderNull = (
  roh: string | null | undefined,
): string | null => {
  try {
    return pruefeVideoLink(roh);
  } catch {
    return null;
  }
};

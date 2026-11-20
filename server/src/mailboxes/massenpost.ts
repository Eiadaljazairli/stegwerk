import { kopfzeile } from './kopfzeile';

export const MASSENPOST_KOPFZEILEN = [
  'list-unsubscribe',
  'list-id',
  'precedence',
  'auto-submitted',
  'x-spam-flag',
] as const;

export const MASCHINE =
  /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounces?|notifications?|newsletter|news|info-noreply)([+._-].*)?@/iu;

export const istMassenpost = (
  kopf: string | null | undefined,
  absender: string | null | undefined,
): boolean => {
  const wert = (name: string) =>
    (kopfzeile(kopf, name) ?? '').trim().toLowerCase();

  if (wert('list-unsubscribe') !== '' || wert('list-id') !== '') {
    return true;
  }

  if (['bulk', 'list', 'junk'].includes(wert('precedence'))) {
    return true;
  }

  const auto = wert('auto-submitted');

  if (auto !== '' && auto !== 'no') {
    return true;
  }

  if (wert('x-spam-flag') === 'yes') {
    return true;
  }

  return absender !== null && absender !== undefined && MASCHINE.test(absender);
};

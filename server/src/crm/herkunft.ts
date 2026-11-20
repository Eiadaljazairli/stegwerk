import { type RequestUser } from '../auth/decorators/current-user.decorator';

export const HERKUNFTE = [
  'manuell',
  'import',
  'webformular',
  'api',
  'mail',
  'automation',
  'beispiel',
] as const;

export type Herkunft = (typeof HERKUNFTE)[number];

export const HERKUNFT_AUS_OBERFLAECHE = ['manuell', 'mail'] as const;

export const herkunftFuer = (
  user: Pick<RequestUser, 'apiKey'>,
  angegeben: string | undefined,
): Herkunft =>
  user.apiKey !== undefined ? 'api' : angegeben === 'mail' ? 'mail' : 'manuell';

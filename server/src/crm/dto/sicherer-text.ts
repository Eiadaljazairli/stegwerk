import { ValidateBy } from 'class-validator';

import { unerlaubteLinks } from '../formatierter-text';

export const SichererText = (): PropertyDecorator =>
  ValidateBy({
    name: 'sichererText',
    validator: {
      validate: (wert: unknown) =>
        typeof wert !== 'string' || unerlaubteLinks(wert).length === 0,
      defaultMessage: () =>
        'Links sind nur mit http, https, mailto oder tel erlaubt.',
    },
  });

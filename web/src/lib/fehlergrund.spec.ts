import { describe, expect, it } from 'vitest';

import { fehlergrund, istGrund } from './fehlergrund';

const vomServer = (reason: string): unknown => ({
  graphQLErrors: [{ extensions: { originalError: { reason } } }],
});

describe('fehlergrund', () => {
  it('liest den Grund aus einer abgelehnten Mutation', () => {
    expect(fehlergrund(vomServer('TWO_FACTOR_REQUIRED'))).toBe(
      'TWO_FACTOR_REQUIRED',
    );
  });

  it('nimmt den ersten Fehler, wenn mehrere kamen', () => {
    expect(
      fehlergrund({
        graphQLErrors: [
          { extensions: { originalError: { reason: 'EMAIL_NOT_VERIFIED' } } },
          { extensions: { originalError: { reason: 'ETWAS_ANDERES' } } },
        ],
      }),
    ).toBe('EMAIL_NOT_VERIFIED');
  });

  it('bleibt bei einem Netzwerkfehler ohne graphQLErrors still', () => {
    expect(fehlergrund(new Error('Failed to fetch'))).toBeNull();
  });

  it('bleibt still, wenn der Server keinen Grund mitgab', () => {
    expect(
      fehlergrund({ graphQLErrors: [{ extensions: { code: 'INTERNAL' } }] }),
    ).toBeNull();
    expect(fehlergrund({ graphQLErrors: [] })).toBeNull();
  });

  it('bleibt still bei null und undefined', () => {
    expect(fehlergrund(null)).toBeNull();
    expect(fehlergrund(undefined)).toBeNull();
  });

  it('nimmt nur Zeichenketten als Grund', () => {
    expect(
      fehlergrund({
        graphQLErrors: [{ extensions: { originalError: { reason: 403 } } }],
      }),
    ).toBeNull();
  });
});

describe('istGrund', () => {
  it('trifft genau den erwarteten Grund', () => {
    const fehler = vomServer('INVITATION_FOR_OTHER_ADDRESS');

    expect(istGrund(fehler, 'INVITATION_FOR_OTHER_ADDRESS')).toBe(true);
    expect(istGrund(fehler, 'EMAIL_NOT_VERIFIED')).toBe(false);
  });

  it('ist false, wenn gar kein Grund kam', () => {
    expect(istGrund(new Error('kaputt'), 'EMAIL_NOT_VERIFIED')).toBe(false);
  });
});

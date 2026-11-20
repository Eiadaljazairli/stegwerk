import { linkToken, signaturStimmt, zerlegeToken } from './angebots-link';

const geheimnis = 'ein-geheimnis-nur-fuer-den-test-0123456789';
const id = '6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b';

describe('Angebots-Link', () => {
  it('erkennt einen Link wieder, den er selbst ausgegeben hat', () => {
    const token = linkToken(geheimnis, id, 'nonce-a');
    const teile = zerlegeToken(token);

    expect(teile?.quoteId).toBe(id);
    expect(
      signaturStimmt(geheimnis, id, 'nonce-a', teile?.signatur ?? ''),
    ).toBe(true);
  });

  it('verwirft den alten Link, sobald die Zufallszahl wechselt', () => {
    const teile = zerlegeToken(linkToken(geheimnis, id, 'nonce-a'));

    expect(
      signaturStimmt(geheimnis, id, 'nonce-b', teile?.signatur ?? ''),
    ).toBe(false);
    expect(signaturStimmt(geheimnis, id, null, teile?.signatur ?? '')).toBe(
      false,
    );
  });

  it('passt nicht zu einem anderen Angebot', () => {
    const fremd = '00000000-0000-4000-8000-000000000000';
    const teile = zerlegeToken(linkToken(geheimnis, id, 'nonce-a'));

    expect(
      signaturStimmt(geheimnis, fremd, 'nonce-a', teile?.signatur ?? ''),
    ).toBe(false);
  });

  it('passt nicht mit einem anderen Geheimnis', () => {
    const teile = zerlegeToken(linkToken(geheimnis, id, 'nonce-a'));

    expect(
      signaturStimmt('anderes-geheimnis', id, 'nonce-a', teile?.signatur ?? ''),
    ).toBe(false);
  });

  it.each([
    '',
    'kein-token',
    `${id}`,
    `${id}.kurz`,
    `nicht-uuid.${'a'.repeat(43)}`,
    `${id}.${'a'.repeat(43)}.mehr`,
  ])('lehnt %p als Token ab', (token) => {
    expect(zerlegeToken(token)).toBeNull();
  });
});

import { linkToken } from '../quotes/angebots-link';
import { aboSignaturStimmt, aboToken, zerlegeAboToken } from './kalender-abo';

const geheimnis = 'ein-geheimnis-nur-fuer-den-test-0123456789';
const id = '6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b';

describe('Kalender-Abo', () => {
  it('erkennt seinen eigenen Link, auch mit .ics am Ende', () => {
    const teile = zerlegeAboToken(`${aboToken(geheimnis, id, 'n')}.ics`);

    expect(teile?.membershipId).toBe(id);
    expect(aboSignaturStimmt(geheimnis, id, 'n', teile?.signatur ?? '')).toBe(
      true,
    );
  });

  it('gilt nach dem Zurücksetzen nicht mehr', () => {
    const teile = zerlegeAboToken(aboToken(geheimnis, id, 'alt'));

    expect(aboSignaturStimmt(geheimnis, id, 'neu', teile?.signatur ?? '')).toBe(
      false,
    );
    expect(aboSignaturStimmt(geheimnis, id, null, teile?.signatur ?? '')).toBe(
      false,
    );
  });

  it('nimmt keinen Angebotslink an, auch bei gleicher ID und Zufallszahl', () => {
    const teile = zerlegeAboToken(linkToken(geheimnis, id, 'n'));

    expect(aboSignaturStimmt(geheimnis, id, 'n', teile?.signatur ?? '')).toBe(
      false,
    );
  });
});

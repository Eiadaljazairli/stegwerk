import { alsReinerText } from '../crm/formatierter-text';
import { aufgabeAlsEvent } from './aufgaben-im-kalender';

const aufgabe = (description: string | null) =>
  aufgabeAlsEvent(
    {
      id: 'a1',
      title: 'Anfrage beantworten: Max',
      description,
      dueDate: '2026-10-21',
      dueTime: null,
      updatedAt: new Date(),
    },
    'stegwerk.test',
  );

describe('Aufgabe im Kalender-Abo', () => {
  it('zeigt eine maskierte Anfrage aus dem Webformular als Klartext', () => {
    const besucher = 'Rückruf (ab 14 Uhr) an max_muster@firma.de\n# Danke';

    expect(aufgabe(alsReinerText(besucher)).description).toBe(
      'Rückruf (ab 14 Uhr) an max_muster@firma.de\n# Danke',
    );
  });

  it('nimmt die Auszeichnung aus einer Beschreibung', () => {
    expect(
      aufgabe('**Wichtig**: [Angebot](https://x.de)\n- [ ] Preise').description,
    ).toBe('Wichtig: Angebot\nPreise');
    expect(aufgabe(null).description).toBeNull();
  });
});

import {
  type DigestTask,
  digestSubject,
  digestText,
  groupTasks,
  MAX_PER_GROUP,
  worthSending,
} from './task-digest';

const aufgabe = (overrides: Partial<DigestTask> = {}): DigestTask => ({
  id: 'a',
  title: 'Angebot nachfassen',
  dueOn: '2026-03-10',
  done: false,
  context: 'Nordwind Logistik GmbH',
  ...overrides,
});

const HEUTE = '2026-03-10';

describe('einteilen', () => {
  it('legt heute Fälliges auf heute', () => {
    expect(groupTasks([aufgabe()], HEUTE).today).toHaveLength(1);
  });

  it('legt Vergangenes auf überfällig', () => {
    expect(
      groupTasks([aufgabe({ dueOn: '2026-03-01' })], HEUTE).overdue,
    ).toHaveLength(1);
  });

  it('legt den nächsten Tag auf morgen', () => {
    expect(
      groupTasks([aufgabe({ dueOn: '2026-03-11' })], HEUTE).tomorrow,
    ).toHaveLength(1);
  });

  it('schaut nicht weiter als bis morgen', () => {
    const gruppen = groupTasks([aufgabe({ dueOn: '2026-03-12' })], HEUTE);

    expect(gruppen.overdue).toHaveLength(0);
    expect(gruppen.today).toHaveLength(0);
    expect(gruppen.tomorrow).toHaveLength(0);
  });

  it('übergeht Erledigtes', () => {
    expect(groupTasks([aufgabe({ done: true })], HEUTE).today).toHaveLength(0);
  });

  it('übergeht Aufgaben ohne Termin', () => {
    expect(groupTasks([aufgabe({ dueOn: null })], HEUTE).today).toHaveLength(0);
  });

  it('stellt die älteste überfällige nach oben', () => {
    const gruppen = groupTasks(
      [
        aufgabe({ id: 'neu', dueOn: '2026-03-08' }),
        aufgabe({ id: 'alt', dueOn: '2026-01-15' }),
      ],
      HEUTE,
    );

    expect(gruppen.overdue.map((task) => task.id)).toEqual(['alt', 'neu']);
  });

  it('kommt über den Monatswechsel hinweg zurecht', () => {
    expect(
      groupTasks([aufgabe({ dueOn: '2026-04-01' })], '2026-03-31').tomorrow,
    ).toHaveLength(1);
  });

  it('stört sich nicht an einer angehängten Uhrzeit', () => {
    expect(
      groupTasks([aufgabe({ dueOn: '2026-03-10T09:00:00Z' })], HEUTE).today,
    ).toHaveLength(1);
  });
});

describe('ob überhaupt etwas hinausgeht', () => {
  it('geht hinaus, wenn etwas überfällig ist', () => {
    expect(
      worthSending(groupTasks([aufgabe({ dueOn: '2026-03-01' })], HEUTE)),
    ).toBe(true);
  });

  it('geht hinaus, wenn heute etwas ansteht', () => {
    expect(worthSending(groupTasks([aufgabe()], HEUTE))).toBe(true);
  });

  it('geht nicht hinaus, wenn nur morgen etwas ansteht', () => {
    expect(
      worthSending(groupTasks([aufgabe({ dueOn: '2026-03-11' })], HEUTE)),
    ).toBe(false);
  });

  it('geht bei gar nichts nicht hinaus', () => {
    expect(worthSending(groupTasks([], HEUTE))).toBe(false);
  });
});

describe('die Betreffzeile', () => {
  it('nennt zuerst das Überfällige', () => {
    expect(
      digestSubject(groupTasks([aufgabe({ dueOn: '2026-03-01' })], HEUTE)),
    ).toBe('1 überfällige Aufgabe');
  });

  it('beugt die Mehrzahl', () => {
    expect(
      digestSubject(
        groupTasks(
          [
            aufgabe({ id: '1', dueOn: '2026-03-01' }),
            aufgabe({ id: '2', dueOn: '2026-03-02' }),
          ],
          HEUTE,
        ),
      ),
    ).toBe('2 überfällige Aufgaben');
  });

  it('nennt sonst, was heute ansteht', () => {
    expect(digestSubject(groupTasks([aufgabe()], HEUTE))).toBe(
      '1 Aufgabe heute',
    );
  });
});

describe('der Text', () => {
  const text = (tasks: DigestTask[]) =>
    digestText(groupTasks(tasks, HEUTE), 'Anna', 'https://example.de/aufgaben');

  it('grüßt mit dem Vornamen', () => {
    expect(text([aufgabe()]).startsWith('Guten Morgen Anna,')).toBe(true);
  });

  it('nennt Titel, Datum und Bezug', () => {
    const geschrieben = text([aufgabe({ dueOn: '2026-03-01' })]);

    expect(geschrieben).toContain('Angebot nachfassen');
    expect(geschrieben).toContain('01.03.2026');
    expect(geschrieben).toContain('Nordwind Logistik GmbH');
  });

  it('lässt die Klammer weg, wenn es keinen Bezug gibt', () => {
    expect(text([aufgabe({ context: null })])).not.toContain('()');
  });

  it('stellt das Überfällige vor das Heutige', () => {
    const geschrieben = text([
      aufgabe({ id: 'heute', title: 'Heute etwas' }),
      aufgabe({ id: 'alt', title: 'Altes etwas', dueOn: '2026-03-01' }),
    ]);

    expect(geschrieben.indexOf('Altes etwas')).toBeLessThan(
      geschrieben.indexOf('Heute etwas'),
    );
  });

  it('endet mit dem Weg ins Programm', () => {
    expect(text([aufgabe()])).toContain('https://example.de/aufgaben');
  });

  it('kürzt eine sehr lange Liste, statt sie ganz auszuschreiben', () => {
    const viele = Array.from({ length: MAX_PER_GROUP + 5 }, (_, index) =>
      aufgabe({ id: String(index), title: `Aufgabe ${String(index)}` }),
    );

    const geschrieben = text(viele);

    expect(geschrieben).toContain('und 5 weitere');
    expect(geschrieben).not.toContain(`Aufgabe ${String(MAX_PER_GROUP + 4)}`);
  });

  it('lässt eine leere Gruppe ganz weg', () => {
    expect(text([aufgabe()])).not.toContain('Überfällig:');
  });
});

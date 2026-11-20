import {
  ATTENDEE_STATUS_LABELS,
  AttendeeStatus,
  attendeeIdentity,
  attendeeProblem,
  attendeeSummary,
  ICS_PARTSTAT,
  isSameAttendee,
} from './attendees';

const kontakt = {
  firstName: 'Katrin',
  lastName: 'Böhm',
  email: 'k.boehm@example.de',
};

const benutzer = {
  firstName: 'Max',
  lastName: 'Berger',
  email: 'max@example.de',
};

describe('wer da steht', () => {
  it('nimmt den Namen aus dem Kontakt', () => {
    const wer = attendeeIdentity({ contactId: 'c1' }, { contact: kontakt });

    expect(wer.name).toBe('Katrin Böhm');
    expect(wer.email).toBe('k.boehm@example.de');
  });

  it('nimmt den Namen aus dem Team', () => {
    const wer = attendeeIdentity({ userId: 'u1' }, { user: benutzer });

    expect(wer.name).toBe('Max Berger');
    expect(wer.email).toBe('max@example.de');
  });

  it('nimmt den eingetippten Namen für jemanden von außen', () => {
    const wer = attendeeIdentity({
      email: 'gutachter@example.de',
      name: 'Dr. Sperling',
    });

    expect(wer.name).toBe('Dr. Sperling');
    expect(wer.email).toBe('gutachter@example.de');
  });

  it('zeigt die Adresse, wenn kein Name dasteht', () => {
    expect(attendeeIdentity({ email: 'gutachter@example.de' }).name).toBe(
      'gutachter@example.de',
    );
    expect(attendeeIdentity({ email: 'x@example.de', name: '  ' }).name).toBe(
      'x@example.de',
    );
  });

  it('sagt es, wenn der Kontakt nicht mehr da ist', () => {
    expect(attendeeIdentity({ contactId: 'c1' }, { contact: null }).name).toBe(
      'Gelöschter Kontakt',
    );
    expect(attendeeIdentity({ userId: 'u1' }, { user: null }).name).toBe(
      'Ehemaliges Teammitglied',
    );
  });

  it('greift auf den mitgeschriebenen Namen zurück, wenn der Verweis ins Leere geht', () => {
    expect(
      attendeeIdentity(
        { contactId: 'c1', name: 'Katrin Böhm' },
        { contact: null },
      ).name,
    ).toBe('Katrin Böhm');
  });

  it('nimmt die aktuelle Adresse des Kontakts und nicht die alte', () => {
    const wer = attendeeIdentity(
      { contactId: 'c1', email: 'alt@example.de' },
      { contact: kontakt },
    );

    expect(wer.email).toBe('k.boehm@example.de');
  });

  it('kommt mit einem Kontakt ohne Adresse zurecht', () => {
    const wer = attendeeIdentity(
      { contactId: 'c1' },
      { contact: { ...kontakt, email: null } },
    );

    expect(wer.name).toBe('Katrin Böhm');
    expect(wer.email).toBeNull();
  });
});

describe('was nicht geht', () => {
  it('nimmt einen Kontakt an', () => {
    expect(attendeeProblem({ contactId: 'c1' })).toBeNull();
  });

  it('nimmt ein Teammitglied an', () => {
    expect(attendeeProblem({ userId: 'u1' })).toBeNull();
  });

  it('nimmt eine Adresse an', () => {
    expect(attendeeProblem({ email: 'gast@example.de' })).toBeNull();
  });

  it('weist zwei Verweise nebeneinander ab', () => {
    expect(attendeeProblem({ contactId: 'c1', userId: 'u1' })).toContain(
      'nicht beides',
    );
  });

  it('weist einen leeren Teilnehmer ab', () => {
    expect(attendeeProblem({})).toContain('braucht');
    expect(attendeeProblem({ email: '   ' })).toContain('braucht');
    expect(attendeeProblem({ name: 'Nur ein Name' })).toContain('braucht');
  });

  it('weist ab, was offensichtlich keine Adresse ist', () => {
    expect(attendeeProblem({ email: 'Katrin Böhm' })).toContain(
      'sieht nicht nach',
    );
    expect(attendeeProblem({ email: 'k@example' })).toContain(
      'sieht nicht nach',
    );
  });

  it('lässt eine Adresse mit Kontakt gelten', () => {
    expect(attendeeProblem({ contactId: 'c1', email: null })).toBeNull();
  });
});

describe('dieselbe Person', () => {
  it('erkennt denselben Kontakt', () => {
    expect(isSameAttendee({ contactId: 'c1' }, { contactId: 'c1' })).toBe(true);
    expect(isSameAttendee({ contactId: 'c1' }, { contactId: 'c2' })).toBe(
      false,
    );
  });

  it('erkennt dasselbe Teammitglied', () => {
    expect(isSameAttendee({ userId: 'u1' }, { userId: 'u1' })).toBe(true);
  });

  it('verwechselt Kontakt und Teammitglied nicht', () => {
    expect(isSameAttendee({ contactId: 'x' }, { userId: 'x' })).toBe(false);
  });

  it('erkennt dieselbe Adresse, egal wie geschrieben', () => {
    expect(
      isSameAttendee(
        { email: 'Gast@Example.de' },
        { email: ' gast@example.de ' },
      ),
    ).toBe(true);
  });

  it('erkennt den Kontakt hinter einer eingetippten Adresse', () => {
    expect(
      isSameAttendee(
        { contactId: 'c1', resolvedEmail: 'k.boehm@example.de' },
        { email: 'k.boehm@example.de' },
      ),
    ).toBe(true);
  });

  it('hält zwei ohne Adresse auseinander', () => {
    expect(isSameAttendee({ email: null }, { email: null })).toBe(false);
    expect(isSameAttendee({ email: '' }, { email: '' })).toBe(false);
  });
});

describe('die Runde in einem Satz', () => {
  it('sagt es, wenn niemand dabei ist', () => {
    expect(attendeeSummary([])).toBe('Keine Teilnehmer');
  });

  it('zählt', () => {
    expect(attendeeSummary([AttendeeStatus.NEEDS_ACTION])).toBe('1 Teilnehmer');
    expect(
      attendeeSummary([
        AttendeeStatus.NEEDS_ACTION,
        AttendeeStatus.NEEDS_ACTION,
      ]),
    ).toBe('2 Teilnehmer');
  });

  it('nennt Zusagen und Absagen', () => {
    expect(
      attendeeSummary([
        AttendeeStatus.ACCEPTED,
        AttendeeStatus.ACCEPTED,
        AttendeeStatus.DECLINED,
        AttendeeStatus.NEEDS_ACTION,
      ]),
    ).toBe('4 Teilnehmer, 2 zugesagt, 1 abgesagt');
  });

  it('lässt weg, was null wäre', () => {
    expect(
      attendeeSummary([AttendeeStatus.ACCEPTED, AttendeeStatus.NEEDS_ACTION]),
    ).toBe('2 Teilnehmer, 1 zugesagt');
  });

  it('zählt Vorbehalte nicht als Zusage', () => {
    expect(
      attendeeSummary([AttendeeStatus.TENTATIVE, AttendeeStatus.TENTATIVE]),
    ).toBe('2 Teilnehmer');
  });
});

describe('die Beschriftungen', () => {
  it('hat für jeden Stand einen deutschen Namen', () => {
    for (const status of Object.values(AttendeeStatus)) {
      expect(ATTENDEE_STATUS_LABELS[status]).toBeTruthy();
      expect(ATTENDEE_STATUS_LABELS[status]).not.toBe(status);
    }
  });

  it('hat für jeden Stand die Schreibweise der Termindatei', () => {
    for (const status of Object.values(AttendeeStatus)) {
      expect(ICS_PARTSTAT[status]).toMatch(/^[A-Z-]+$/);
    }

    expect(ICS_PARTSTAT[AttendeeStatus.NEEDS_ACTION]).toBe('NEEDS-ACTION');
  });
});

import { type DataSource } from 'typeorm';

import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { melde } from '../webhooks/ereignisse';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  ausMeldung,
  buendeln,
  type LiveAusgabe,
  type LiveMeldung,
  liesLiveMeldung,
} from './live-ereignis';
import {
  kuerzen,
  type Abonnent,
  LiveService,
  SAMMELN_MS,
} from './live.service';

const SUITE = 'w5_live';

jest.setTimeout(60_000);

const warte = (ms: number) => new Promise((fertig) => setTimeout(fertig, ms));

let dataSource: DataSource;
let live: LiveService;
let bereich: string;
let fremderBereich: string;
let inhaber: UserEntity;
let aushilfe: UserEntity;
let fremder: UserEntity;
let eigenerKontakt: ContactEntity;
let fremderKontakt: ContactEntity;
let geschaeft: DealEntity;

const ID = '6f0e3c8a-1d2b-4c5d-8e9f-0a1b2c3d4e5f';

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  live = new LiveService(
    dataSource,
    new PermissionsService(
      dataSource.getRepository(MembershipEntity),
      dataSource.getRepository(RoleEntity),
    ),
  );

  const m = dataSource.manager;

  bereich = (
    await m.save(m.create(WorkspaceEntity, { name: 'Live', slug: 'live' }))
  ).id;
  fremderBereich = (
    await m.save(m.create(WorkspaceEntity, { name: 'Fremd', slug: 'fremd' }))
  ).id;

  const person = (email: string, firstName: string) =>
    m.save(
      m.create(UserEntity, {
        email,
        passwordHash: 'x',
        firstName,
        lastName: 'Muster',
      }),
    );

  inhaber = await person('inhaber@live.test', 'Ines');
  aushilfe = await person('aushilfe@live.test', 'Anton');
  fremder = await person('fremder@fremd.test', 'Fritz');

  const rolle = await m.save(
    m.create(RoleEntity, {
      workspaceId: bereich,
      name: 'Aushilfe',
      permissions: [Permission.CONTACT_VIEW],
      sichtbarkeit: { company: 'alle', contact: 'eigene', deal: 'alle' },
      feldrechte: { 'contact.email': 'verborgen' },
    }),
  );

  await m.save([
    m.create(MembershipEntity, {
      workspaceId: bereich,
      userId: inhaber.id,
      role: MembershipRole.OWNER,
    }),
    m.create(MembershipEntity, {
      workspaceId: bereich,
      userId: aushilfe.id,
      role: MembershipRole.MEMBER,
      roleId: rolle.id,
    }),
    m.create(MembershipEntity, {
      workspaceId: fremderBereich,
      userId: fremder.id,
      role: MembershipRole.OWNER,
    }),
  ]);

  eigenerKontakt = await m.save(
    m.create(ContactEntity, {
      workspaceId: bereich,
      firstName: 'Eva',
      lastName: 'Eigen',
      ownerId: aushilfe.id,
    }),
  );
  fremderKontakt = await m.save(
    m.create(ContactEntity, {
      workspaceId: bereich,
      firstName: 'Olaf',
      lastName: 'Other',
      ownerId: inhaber.id,
    }),
  );
  geschaeft = await m.save(
    m.create(DealEntity, {
      workspaceId: bereich,
      name: 'Großauftrag',
      ownerId: inhaber.id,
    }),
  );
});

afterAll(async () => {
  await live.onModuleDestroy();
  await dropTestDatabase(dataSource, SUITE);
});

const strom = (userId: string, workspaceId = bereich) => {
  const empfangen: LiveAusgabe[][] = [];
  const geschlossen = { ja: false, grund: undefined as string | undefined };
  const abonnent: Abonnent = {
    userId,
    workspaceId,
    senden: (aenderungen) => empfangen.push(aenderungen),
    nachladen: () => undefined,
    schliessen: (grund) => {
      geschlossen.ja = true;
      geschlossen.grund = grund;
    },
  };
  const abmelden = live.abonnieren(abonnent);

  return { empfangen, abmelden, geschlossen };
};

const meldung = (teil: Partial<LiveMeldung>): LiveMeldung => ({
  workspaceId: bereich,
  objekt: 'contact',
  id: eigenerKontakt.id,
  aktion: 'updated',
  von: inhaber.id,
  tab: 'fenster-0001',
  verweise: { ownerId: aushilfe.id },
  vorher: {},
  felder: null,
  ...teil,
});

const nachDemSammeln = () => warte(SAMMELN_MS + 150);

describe('Aus der Webhook-Meldung', () => {
  it('nimmt Objekt, Kennung, Aktion und nur die Verweise', () => {
    expect(
      ausMeldung(
        {
          workspaceId: bereich,
          event: 'contact.updated',
          data: { id: ID, email: 'geheim@x.de', ownerId: null, companyId: ID },
          changes: {
            email: { before: 'a@x.de', after: 'geheim@x.de' },
            ownerId: { before: ID, after: null },
          },
        },
        'u1',
        'fenster-0001',
      ),
    ).toEqual({
      workspaceId: bereich,
      objekt: 'contact',
      id: ID,
      aktion: 'updated',
      von: 'u1',
      tab: 'fenster-0001',
      verweise: { ownerId: null, companyId: ID },
      vorher: { ownerId: ID },
      felder: ['email', 'ownerId'],
    });
  });

  it('macht aus besonderen Ereignissen ein „geändert“', () => {
    expect(
      ausMeldung(
        { workspaceId: bereich, event: 'deal.won', data: { id: ID } },
        null,
        null,
      ),
    ).toMatchObject({ objekt: 'deal', aktion: 'updated', felder: null });
    expect(
      ausMeldung(
        {
          workspaceId: bereich,
          event: 'deal.contact_added',
          data: { dealId: ID, contactId: geschaeftId() },
        },
        null,
        null,
      ),
    ).toMatchObject({ objekt: 'deal', id: ID, verweise: {} });
  });

  it('übergeht, was keinen Datensatz meint', () => {
    expect(
      ausMeldung(
        {
          workspaceId: bereich,
          event: 'deal.created',
          data: { test: true, name: 'Probe' },
        },
        null,
        null,
      ),
    ).toBeNull();
  });

  it('liest aus dem Kanal nur Gültiges', () => {
    expect(liesLiveMeldung('kein json')).toBeNull();
    expect(liesLiveMeldung(JSON.stringify({ objekt: 'konto' }))).toBeNull();
    expect(liesLiveMeldung(JSON.stringify(meldung({})))).toEqual(meldung({}));
  });

  it('kürzt eine zu lange Meldung um Feldnamen statt sie zu verwerfen', () => {
    const lang = meldung({
      felder: Array.from({ length: 400 }, (_, i) => `customFields.feld${i}`),
    });
    const gekuerzt = kuerzen(lang);

    expect(gekuerzt).not.toBeNull();
    expect((gekuerzt ?? '').length).toBeLessThanOrEqual(7_500);
    expect(JSON.parse(gekuerzt ?? '{}').felder.length).toBeLessThan(400);
  });
});

function geschaeftId(): string {
  return '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
}

describe('Bündeln', () => {
  const eintrag = (id: string | null, aktion: LiveAusgabe['aktion']) =>
    ({ objekt: 'deal', id, aktion, von: null, tab: null }) as LiveAusgabe;

  it('zählt dieselbe Kennung einmal, mit der letzten Aktion', () => {
    expect(
      buendeln([
        eintrag('a', 'created'),
        eintrag('b', 'updated'),
        eintrag('a', 'deleted'),
      ]),
    ).toEqual([eintrag('b', 'updated'), eintrag('a', 'deleted')]);
  });

  it('macht aus zu vielen Kennungen einer Art einen Eintrag für die Art', () => {
    const viele = Array.from({ length: 5 }, (_, i) =>
      eintrag(`d${i}`, 'updated'),
    );

    expect(
      buendeln(
        [...viele, { ...eintrag('k', 'updated'), objekt: 'contact' }],
        3,
      ),
    ).toEqual([
      eintrag(null, 'updated'),
      { ...eintrag('k', 'updated'), objekt: 'contact' },
    ]);
  });
});

describe('Eintrittskarten', () => {
  it('gilt genau einmal', async () => {
    const karte = await live.ticketAusstellen({
      userId: inhaber.id,
      workspaceId: bereich,
      email: '',
    });

    await expect(live.ticketEinloesen(karte)).resolves.toEqual({
      userId: inhaber.id,
      workspaceId: bereich,
    });
    await expect(live.ticketEinloesen(karte)).resolves.toBeNull();
  });

  it('läuft nach einer Minute ab', async () => {
    const karte = await live.ticketAusstellen({
      userId: aushilfe.id,
      workspaceId: bereich,
      email: '',
    });

    await dataSource.query(
      `UPDATE "live_tickets" SET "expiresAt" = now() - interval '1 second'`,
    );

    await expect(live.ticketEinloesen(karte)).resolves.toBeNull();
  });

  it('gilt nicht mehr, wenn die Person den Bereich verlassen hat', async () => {
    const karte = await live.ticketAusstellen({
      userId: fremder.id,
      workspaceId: bereich,
      email: '',
    });

    await expect(live.ticketEinloesen(karte)).resolves.toBeNull();
  });

  it('weist Schlüssel und Unsinn ab', async () => {
    await expect(
      live.ticketAusstellen({
        userId: ID,
        workspaceId: bereich,
        email: '',
        apiKey: { id: ID, name: 'Programm', permissions: [] },
      }),
    ).rejects.toThrow('nicht für Schlüssel');
    await expect(live.ticketEinloesen("x' OR 1=1 --")).resolves.toBeNull();
  });
});

describe('Wer was erfährt', () => {
  it('der Inhaber alles in seinem Bereich, mit Namen', async () => {
    const ines = strom(inhaber.id);

    await live.verteilen(meldung({ von: aushilfe.id }));
    await nachDemSammeln();
    ines.abmelden();

    expect(ines.empfangen).toEqual([
      [
        {
          objekt: 'contact',
          id: eigenerKontakt.id,
          aktion: 'updated',
          von: { id: aushilfe.id, name: 'Anton Muster' },
          tab: null,
        },
      ],
    ]);
  });

  it('die eingeschränkte Rolle nur, was ihre Zeilen- und Objektrechte zeigen', async () => {
    const anton = strom(aushilfe.id);

    await live.verteilen(meldung({}));
    await live.verteilen(
      meldung({ id: fremderKontakt.id, verweise: { ownerId: inhaber.id } }),
    );
    await live.verteilen(
      meldung({ objekt: 'deal', id: geschaeft.id, verweise: {} }),
    );
    await nachDemSammeln();
    anton.abmelden();

    expect(anton.empfangen.flat().map((e) => e.id)).toEqual([
      eigenerKontakt.id,
    ]);
  });

  it('nichts, wenn sich nur ein für sie verborgenes Feld änderte', async () => {
    const anton = strom(aushilfe.id);
    const ines = strom(inhaber.id);

    await live.verteilen(meldung({ felder: ['email'] }));
    await nachDemSammeln();
    anton.abmelden();
    ines.abmelden();

    expect(anton.empfangen).toEqual([]);
    expect(ines.empfangen.flat()).toHaveLength(1);
  });

  it('wer einen Datensatz durch die Änderung verliert, erfährt es noch', async () => {
    const anton = strom(aushilfe.id);

    await live.verteilen(
      meldung({
        verweise: { ownerId: inhaber.id },
        vorher: { ownerId: aushilfe.id },
        felder: ['ownerId'],
      }),
    );
    await nachDemSammeln();
    anton.abmelden();

    expect(anton.empfangen.flat().map((e) => e.id)).toEqual([
      eigenerKontakt.id,
    ]);
  });

  it('ein fremder Bereich nichts', async () => {
    const fritz = strom(fremder.id, fremderBereich);

    await live.verteilen(meldung({}));
    await nachDemSammeln();
    fritz.abmelden();

    expect(fritz.empfangen).toEqual([]);
  });

  it('nennt das Fenster nur der Person, die änderte', async () => {
    const ines = strom(inhaber.id);
    const anton = strom(aushilfe.id);

    await live.verteilen(meldung({}));
    await nachDemSammeln();
    ines.abmelden();
    anton.abmelden();

    expect(ines.empfangen.flat()[0].tab).toBe('fenster-0001');
    expect(anton.empfangen.flat()[0].tab).toBeNull();
  });

  it('bündelt, was kurz nacheinander kommt', async () => {
    const ines = strom(inhaber.id);

    await live.verteilen(meldung({ aktion: 'created' }));
    await live.verteilen(meldung({}));
    await live.verteilen(
      meldung({ id: fremderKontakt.id, verweise: { ownerId: inhaber.id } }),
    );
    await nachDemSammeln();
    ines.abmelden();

    expect(ines.empfangen).toHaveLength(1);
    expect(ines.empfangen[0].map((e) => [e.id, e.aktion])).toEqual([
      [eigenerKontakt.id, 'updated'],
      [fremderKontakt.id, 'updated'],
    ]);
  });

  it('schließt den Strom, wenn die Person den Bereich verlässt', async () => {
    const zweiter = await dataSource.manager.save(
      dataSource.manager.create(UserEntity, {
        email: 'geht@live.test',
        passwordHash: 'x',
        firstName: 'Gerd',
        lastName: 'Geht',
      }),
    );

    await dataSource.manager.save(
      dataSource.manager.create(MembershipEntity, {
        workspaceId: bereich,
        userId: zweiter.id,
        role: MembershipRole.OWNER,
      }),
    );

    const gerd = strom(zweiter.id);

    await dataSource.manager.delete(MembershipEntity, {
      userId: zweiter.id,
      workspaceId: bereich,
    });
    await live.verteilen(meldung({}));
    await nachDemSammeln();

    expect(gerd.geschlossen.ja).toBe(true);
    expect(gerd.geschlossen.grund).toBeUndefined();
    expect(gerd.empfangen).toEqual([]);
  });

  it('verdrängt beim neunten Fenster das älteste und sagt ihm, warum', () => {
    const fenster = Array.from({ length: 9 }, () => strom(aushilfe.id));

    try {
      expect(fenster[0].geschlossen).toEqual({ ja: true, grund: 'verdraengt' });
      expect(fenster.slice(1).every((f) => !f.geschlossen.ja)).toBe(true);
    } finally {
      for (const f of fenster) {
        f.abmelden();
      }
    }
  });
});

describe('Über Postgres', () => {
  it('kommt eine gespeicherte Änderung als Meldung beim Kollegen an', async () => {
    live.onModuleInit();

    for (let i = 0; i < 50 && !live.hoertZu(); i += 1) {
      await warte(100);
    }

    expect(live.hoertZu()).toBe(true);

    const ines = strom(inhaber.id);

    runWithRequestContext(
      { requestId: 'r1', userId: aushilfe.id, tab: 'fenster-0002' },
      () =>
        melde({
          workspaceId: bereich,
          event: 'contact.updated',
          data: { id: eigenerKontakt.id, ownerId: aushilfe.id },
          changes: { lastName: { before: 'Eigen', after: 'Eigner' } },
        }),
    );

    for (let i = 0; i < 30 && ines.empfangen.length === 0; i += 1) {
      await warte(100);
    }

    ines.abmelden();

    expect(ines.empfangen.flat()).toEqual([
      {
        objekt: 'contact',
        id: eigenerKontakt.id,
        aktion: 'updated',
        von: { id: aushilfe.id, name: 'Anton Muster' },
        tab: null,
      },
    ]);
  });

  it('schreibt die Änderung einer Automation nicht ihrer Erstellerin zu', async () => {
    expect(live.hoertZu()).toBe(true);

    const ines = strom(inhaber.id);

    runWithRequestContext(
      {
        requestId: 'automation-a1',
        automationId: 'a1',
        userId: aushilfe.id,
        tab: 'fenster-0003',
      },
      () =>
        melde({
          workspaceId: bereich,
          event: 'contact.updated',
          data: { id: eigenerKontakt.id, ownerId: aushilfe.id },
          changes: { lastName: { before: 'Eigner', after: 'Eigen' } },
        }),
    );

    for (let i = 0; i < 30 && ines.empfangen.length === 0; i += 1) {
      await warte(100);
    }

    ines.abmelden();

    expect(ines.empfangen.flat()).toEqual([
      {
        objekt: 'contact',
        id: eigenerKontakt.id,
        aktion: 'updated',
        von: null,
        tab: null,
      },
    ]);
  });
});

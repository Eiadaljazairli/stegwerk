import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity, DealStage } from '../crm/entities/deal.entity';
import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { setzeSichtfeld } from '../workspaces/sichtbarkeit';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { MailEntwurfEntity } from './mail-entwurf.entity';
import { MailEntwuerfeResolver } from './mail-entwuerfe.resolver';
import { entwurfAnlegen, MailEntwuerfeService } from './mail-entwuerfe.service';
import { type MailboxesService } from './mailboxes.service';

const SUITE = 'mail_entwuerfe';

jest.setTimeout(60_000);

let dataSource: DataSource;
let rechte: PermissionsService;
let dienst: MailEntwuerfeService;
let resolver: MailEntwuerfeResolver;
let bereich: string;
let karla: ContactEntity;
let annasKontakt: ContactEntity;
const leute = {} as Record<
  'inhaber' | 'ben' | 'leer' | 'fremd' | 'schluessel' | 'vorschlagend',
  RequestUser
>;

let versandt: { userId: string; an: string[]; betreff: string }[] = [];
let scheitern = false;
let danachScheitern = false;
let warten: Promise<void> = Promise.resolve();

const postfach = {
  senden: async (
    _workspaceId: string,
    userId: string,
    post: { an: string[]; betreff: string },
    optionen: { abgeschickt?: () => void } = {},
  ) => {
    await warten;

    if (scheitern) {
      throw new BadRequestException('Für Sie ist kein Postfach verbunden.');
    }

    versandt.push({ userId, an: post.an, betreff: post.betreff });
    optionen.abgeschickt?.();

    if (danachScheitern) {
      throw new Error('Verbindung zur Datenbank verloren');
    }

    return { id: null };
  },
} as unknown as MailboxesService;

const als = <T>(wer: RequestUser, tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: 'test' }, () => {
    setzeSichtfeld(() => rechte.sichtfeldFuer(wer));

    return tun();
  });

const felder = {
  an: ['karla@kunde.de'],
  betreff: 'Ihr Angebot',
  rumpf: 'Guten Tag Frau Kunde,\n\nanbei …',
};

const entwurfFuer = (ownerId: string) =>
  entwurfAnlegen(dataSource.manager, {
    workspaceId: bereich,
    ownerId,
    ...felder,
    ziel: { contactId: karla.id },
    quelle: 'automation',
    vonId: null,
  });

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  rechte = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );
  dienst = new MailEntwuerfeService(
    dataSource.getRepository(MailEntwurfEntity),
    postfach,
  );
  resolver = new MailEntwuerfeResolver(dienst, rechte);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE workspaces, users CASCADE');
  versandt = [];
  scheitern = false;
  danachScheitern = false;
  warten = Promise.resolve();

  const m = dataSource.manager;

  bereich = (await m.save(m.create(WorkspaceEntity, { name: 'V', slug: 'v' })))
    .id;

  const fremderBereich = (
    await m.save(m.create(WorkspaceEntity, { name: 'F', slug: 'f' }))
  ).id;
  const rolle = (
    workspaceId: string,
    permissions: Permission[],
    everything = false,
    eigene = false,
  ) =>
    m.save(
      m.create(RoleEntity, {
        workspaceId,
        name: `Rolle ${String(Math.random())}`,
        everything,
        permissions,
        ...(eigene
          ? {
              sichtbarkeit: {
                company: 'eigene',
                contact: 'eigene',
                deal: 'eigene',
              },
            }
          : {}),
      }),
    );
  const person = async (
    kurz: keyof typeof leute,
    workspaceId: string,
    roleId: string,
  ) => {
    const user = await m.save(
      m.create(UserEntity, {
        email: `${kurz}@entwurf.test`,
        passwordHash: 'x',
        firstName: kurz,
        lastName: 'Test',
      }),
    );

    await m.save(
      m.create(MembershipEntity, {
        userId: user.id,
        workspaceId,
        role: MembershipRole.MEMBER,
        roleId,
      }),
    );
    leute[kurz] = { userId: user.id, workspaceId, email: user.email };
  };

  await person('inhaber', bereich, (await rolle(bereich, [], true)).id);
  await person(
    'ben',
    bereich,
    (await rolle(bereich, [Permission.CONTACT_VIEW], false, true)).id,
  );
  await person('leer', bereich, (await rolle(bereich, [])).id);
  await person(
    'fremd',
    fremderBereich,
    (await rolle(fremderBereich, [], true)).id,
  );

  karla = await m.save(
    m.create(ContactEntity, {
      workspaceId: bereich,
      firstName: 'Karla',
      lastName: 'Kunde',
      email: 'karla@kunde.de',
      ownerId: leute.ben.userId,
    }),
  );
  annasKontakt = await m.save(
    m.create(ContactEntity, {
      workspaceId: bereich,
      firstName: 'Anton',
      lastName: 'Andere',
      email: 'anton@kunde.de',
      ownerId: leute.inhaber.userId,
    }),
  );

  const schluessel = async (modus: 'direkt' | 'vorschlag') => {
    const [zeile] = (await dataSource.query(
      `INSERT INTO "api_keys" ("workspaceId", "name", "kennung", "hash", "permissions", "schreibmodus", "createdById")
       VALUES ($1, $2, $3, 'x', ARRAY['contact:view'], $4, $5) RETURNING "id"`,
      [bereich, `KI ${modus}`, `kennung-${modus}`, modus, leute.inhaber.userId],
    )) as { id: string }[];

    return {
      userId: zeile.id,
      workspaceId: bereich,
      email: 'KI (Schlüssel)',
      apiKey: {
        id: zeile.id,
        name: `KI ${modus}`,
        permissions: ['contact:view'],
        schreibmodus: modus,
      },
    } satisfies RequestUser;
  };

  leute.schluessel = await schluessel('direkt');
  leute.vorschlagend = await schluessel('vorschlag');
});

describe('anlegen', () => {
  it('nimmt ohne Empfänger die Adresse des Kontakts und meldet es der Glocke des Anlegers des Schlüssels', async () => {
    const entwurf = await als(leute.schluessel, () =>
      resolver.mailEntwurfAnlegen(leute.schluessel, {
        art: 'contact',
        id: karla.id,
        betreff: 'Ihr Angebot',
        rumpf: 'Guten Tag …',
      }),
    );

    expect(entwurf).toMatchObject({
      ownerId: leute.inhaber.userId,
      an: ['karla@kunde.de'],
      quelle: 'ki',
      contactId: karla.id,
      status: 'entwurf',
    });

    const glocke = (await dataSource.query(
      `SELECT "empfaengerId", "art" FROM "benachrichtigungen" WHERE "mailEntwurfId" = $1`,
      [entwurf.id],
    )) as { empfaengerId: string; art: string }[];

    expect(glocke).toEqual([
      { empfaengerId: leute.inhaber.userId, art: 'mail_entwurf' },
    ]);
  });

  it('verlangt das Leserecht der Akte und die Zeilenrechte', async () => {
    await expect(
      als(leute.leer, () =>
        resolver.mailEntwurfAnlegen(leute.leer, {
          art: 'contact',
          id: karla.id,
          betreff: 'x',
          rumpf: 'y',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      als(leute.ben, () =>
        resolver.mailEntwurfAnlegen(leute.ben, {
          art: 'contact',
          id: annasKontakt.id,
          betreff: 'x',
          rumpf: 'y',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      als(leute.fremd, () =>
        resolver.mailEntwurfAnlegen(leute.fremd, {
          art: 'contact',
          id: karla.id,
          betreff: 'x',
          rumpf: 'y',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await dataSource.getRepository(MailEntwurfEntity).count()).toBe(0);
  });

  it('lässt einen vorschlagenden Schlüssel nicht am Vorschlag vorbei', async () => {
    await expect(
      als(leute.vorschlagend, () =>
        resolver.mailEntwurfAnlegen(leute.vorschlagend, {
          art: 'contact',
          id: karla.id,
          betreff: 'x',
          rumpf: 'y',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  const jemand = async (
    permissions: Permission[],
    extra: Partial<RoleEntity> = {},
  ): Promise<RequestUser> => {
    const m = dataSource.manager;
    const rolle = await m.save(
      m.create(RoleEntity, {
        workspaceId: bereich,
        name: `Rolle ${String(Math.random())}`,
        everything: false,
        permissions,
        ...extra,
      }),
    );
    const user = await m.save(
      m.create(UserEntity, {
        email: `p${String(Math.random()).slice(2)}@entwurf.test`,
        passwordHash: 'x',
        firstName: 'P',
        lastName: 'Test',
      }),
    );

    await m.save(
      m.create(MembershipEntity, {
        userId: user.id,
        workspaceId: bereich,
        role: MembershipRole.MEMBER,
        roleId: rolle.id,
      }),
    );

    return { userId: user.id, workspaceId: bereich, email: user.email };
  };

  const ohneAn = (wer: RequestUser, art: 'contact' | 'deal', id: string) =>
    als(wer, () =>
      resolver.mailEntwurfAnlegen(wer, { art, id, betreff: 'x', rumpf: 'y' }),
    );

  it('nimmt keine Adresse, die das Feldrecht verbirgt', async () => {
    const ohneAdresse = await jemand([Permission.CONTACT_VIEW], {
      feldrechte: { 'contact.email': 'verborgen' },
    });

    await expect(ohneAn(ohneAdresse, 'contact', karla.id)).rejects.toThrow(
      'die Sie sehen dürfen',
    );
    expect(await dataSource.getRepository(MailEntwurfEntity).count()).toBe(0);

    await expect(
      als(ohneAdresse, () =>
        resolver.mailEntwurfAnlegen(ohneAdresse, {
          art: 'contact',
          id: karla.id,
          an: ['zentrale@kunde.de'],
          betreff: 'x',
          rumpf: 'y',
        }),
      ),
    ).resolves.toMatchObject({ an: ['zentrale@kunde.de'] });
  });

  it('nimmt beim Geschäft keinen Hauptkontakt, den die Rechte nicht zeigen', async () => {
    const m = dataSource.manager;
    const nurEigene = await jemand(
      [Permission.DEAL_VIEW, Permission.CONTACT_VIEW],
      {
        sichtbarkeit: { company: 'eigene', contact: 'eigene', deal: 'eigene' },
      },
    );
    const geschaeft = await m.save(
      m.create(DealEntity, {
        workspaceId: bereich,
        name: 'Dach',
        stage: DealStage.LEAD,
        ownerId: nurEigene.userId,
        primaryContactId: annasKontakt.id,
      }),
    );

    await expect(ohneAn(nurEigene, 'deal', geschaeft.id)).rejects.toThrow(
      'die Sie sehen dürfen',
    );

    const ohneKontakte = await jemand([Permission.DEAL_VIEW]);

    await expect(ohneAn(ohneKontakte, 'deal', geschaeft.id)).rejects.toThrow(
      'die Sie sehen dürfen',
    );

    await expect(
      ohneAn(leute.inhaber, 'deal', geschaeft.id),
    ).resolves.toMatchObject({ an: ['anton@kunde.de'] });
  });

  it('weist Kopfzeilen-Einschleusung und zu viele Empfänger ab', async () => {
    await expect(
      als(leute.inhaber, () =>
        dienst.anlegen(
          leute.inhaber,
          {
            art: 'contact',
            id: karla.id,
            betreff: 'Hallo\r\nBcc: alle@welt.de',
            rumpf: 'x',
          },
          null,
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      als(leute.inhaber, () =>
        dienst.anlegen(
          leute.inhaber,
          {
            art: 'contact',
            id: karla.id,
            an: Array.from({ length: 21 }, (_, i) => `a${String(i)}@b.de`),
            betreff: 'x',
            rumpf: 'y',
          },
          null,
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('senden', () => {
  it('sendet aus dem Postfach der Eigentümerin, mit den geänderten Feldern', async () => {
    const entwurf = await entwurfFuer(leute.ben.userId);

    const gesendet = await dienst.senden(leute.ben, entwurf.id, {
      ...felder,
      betreff: 'Ihr Angebot (überarbeitet)',
    });

    expect(gesendet).toMatchObject({
      status: 'gesendet',
      betreff: 'Ihr Angebot (überarbeitet)',
    });
    expect(gesendet.gesendetAm).not.toBeNull();
    expect(versandt).toEqual([
      {
        userId: leute.ben.userId,
        an: ['karla@kunde.de'],
        betreff: 'Ihr Angebot (überarbeitet)',
      },
    ]);
  });

  it('sendet bei zwei gleichzeitigen Klicks genau einmal', async () => {
    const entwurf = await entwurfFuer(leute.ben.userId);
    let loslassen: () => void = () => undefined;

    warten = new Promise((fertig) => {
      loslassen = fertig;
    });

    const erster = dienst.senden(leute.ben, entwurf.id, felder);
    const zweiter = dienst.senden(leute.ben, entwurf.id, felder);

    await expect(zweiter).rejects.toBeInstanceOf(BadRequestException);
    loslassen();
    await expect(erster).resolves.toMatchObject({ status: 'gesendet' });
    expect(versandt).toHaveLength(1);

    await expect(
      dienst.senden(leute.ben, entwurf.id, felder),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(versandt).toHaveLength(1);
  });

  it('bleibt nach einem gescheiterten Versand ein Entwurf, mit dem neuen Text', async () => {
    const entwurf = await entwurfFuer(leute.ben.userId);

    scheitern = true;

    await expect(
      dienst.senden(leute.ben, entwurf.id, { ...felder, rumpf: 'Neu' }),
    ).rejects.toThrow('Postfach');

    const danach = await dienst.eigener(leute.ben, entwurf.id);

    expect(danach).toMatchObject({ status: 'entwurf', rumpf: 'Neu' });
  });

  it('gibt einen verschickten Entwurf nicht wieder frei, wenn danach die Buchführung scheitert', async () => {
    const entwurf = await entwurfFuer(leute.ben.userId);

    danachScheitern = true;

    await expect(
      dienst.senden(leute.ben, entwurf.id, felder),
    ).resolves.toMatchObject({ status: 'gesendet', nachrichtId: null });

    danachScheitern = false;

    await expect(
      dienst.senden(leute.ben, entwurf.id, felder),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(versandt).toHaveLength(1);
  });

  it('zeigt und sendet fremde Entwürfe nicht, auch nicht der Inhaberin', async () => {
    const entwurf = await entwurfFuer(leute.ben.userId);

    expect(await dienst.liste(leute.inhaber)).toEqual([]);
    await expect(
      dienst.senden(leute.inhaber, entwurf.id, felder),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      dienst.verwerfen(leute.fremd, entwurf.id),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(versandt).toHaveLength(0);
    expect((await dienst.liste(leute.ben)).map((e) => e.id)).toEqual([
      entwurf.id,
    ]);
  });

  it('sendet einen verworfenen Entwurf nicht mehr und erledigt die Glocke', async () => {
    const entwurf = await entwurfFuer(leute.ben.userId);

    await dienst.verwerfen(leute.ben, entwurf.id);

    await expect(
      dienst.senden(leute.ben, entwurf.id, felder),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await dienst.anzahlOffen(leute.ben)).toBe(0);

    const [glocke] = (await dataSource.query(
      `SELECT "gelesenAm" FROM "benachrichtigungen" WHERE "mailEntwurfId" = $1`,
      [entwurf.id],
    )) as { gelesenAm: Date | null }[];

    expect(glocke.gelesenAm).not.toBeNull();
  });
});

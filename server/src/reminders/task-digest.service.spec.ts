import { type ConfigService } from '@nestjs/config';
import { type DataSource } from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { type Mail, type MailService } from '../mail/mail.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { type Sichtbarkeit } from '../workspaces/sichtbarkeit';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { TaskDigestService } from './task-digest.service';

const SUITE = 'task_digest';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: TaskDigestService;
let workspaceId: string;
let otherWorkspaceId: string;
let annaId: string;
let jonasId: string;
let versandt: Mail[] = [];
let nurEigeneFirmen: string[] = [];

const rechte = {
  sichtfeldFuer: ({ userId }: { userId: string }) => {
    const arten: Sichtbarkeit = {
      company: nurEigeneFirmen.includes(userId) ? 'eigene' : 'alle',
      contact: 'alle',
      deal: 'alle',
    };

    return Promise.resolve({ ich: userId, arten, felder: {} });
  },
} as unknown as ConstructorParameters<typeof TaskDigestService>[4];

const postfach = {
  send: (mail: Mail) => {
    versandt.push(mail);

    return Promise.resolve(true);
  },
} as unknown as MailService;

const einstellungen = {
  get: () => 'https://crm.example.de',
} as unknown as ConfigService;

const aufgabe = async (options: {
  title: string;
  dueDate: string | null;
  assigneeId: string;
  done?: boolean;
  workspace?: string;
  companyId?: string;
}): Promise<void> => {
  const tasks = dataSource.getRepository(TaskEntity);

  await tasks.save(
    tasks.create({
      workspaceId: options.workspace ?? workspaceId,
      title: options.title,
      dueDate: options.dueDate,
      assigneeId: options.assigneeId,
      createdById: options.assigneeId,
      completedAt: options.done === true ? new Date() : null,
      companyId: options.companyId ?? null,
    }),
  );
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new TaskDigestService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(TaskEntity),
    postfach,
    einstellungen,
    rechte,
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE tasks, memberships, workspaces, users CASCADE',
  );

  versandt = [];
  nurEigeneFirmen = [];

  const workspaces = dataSource.getRepository(WorkspaceEntity);
  const users = dataSource.getRepository(UserEntity);
  const memberships = dataSource.getRepository(MembershipEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Wir', slug: 'wir' }))
  ).id;
  otherWorkspaceId = (
    await workspaces.save(workspaces.create({ name: 'Andere', slug: 'andere' }))
  ).id;

  annaId = (
    await users.save(
      users.create({
        email: 'anna@wir.de',
        passwordHash: 'x',
        firstName: 'Anna',
        lastName: 'Schmidt',
      }),
    )
  ).id;

  jonasId = (
    await users.save(
      users.create({
        email: 'jonas@wir.de',
        passwordHash: 'x',
        firstName: 'Jonas',
        lastName: 'Weber',
      }),
    )
  ).id;

  await memberships.save([
    memberships.create({
      workspaceId,
      userId: annaId,
      role: MembershipRole.OWNER,
      taskDigest: true,
    }),
    memberships.create({
      workspaceId,
      userId: jonasId,
      role: MembershipRole.MEMBER,
      taskDigest: true,
    }),
  ]);
});

describe('der Durchlauf', () => {
  it('schickt an die Person mit einer überfälligen Aufgabe', async () => {
    await aufgabe({
      title: 'Angebot nachfassen',
      dueDate: '2026-03-01',
      assigneeId: annaId,
    });

    const report = await service.run('2026-03-10');

    expect(report.sent).toBe(1);
    expect(versandt[0].to).toBe('anna@wir.de');
    expect(versandt[0].subject).toContain('überfällige');
  });

  it('schickt an niemanden, der nichts zu tun hat', async () => {
    const report = await service.run('2026-03-10');

    expect(report.sent).toBe(0);
    expect(versandt).toHaveLength(0);
  });

  it('schickt jeder Person nur ihre eigenen Aufgaben', async () => {
    await aufgabe({
      title: 'Annas Sache',
      dueDate: '2026-03-10',
      assigneeId: annaId,
    });
    await aufgabe({
      title: 'Jonas Sache',
      dueDate: '2026-03-10',
      assigneeId: jonasId,
    });

    await service.run('2026-03-10');

    const anAnna = versandt.find((mail) => mail.to === 'anna@wir.de');

    expect(anAnna?.text).toContain('Annas Sache');
    expect(anAnna?.text).not.toContain('Jonas Sache');
  });

  it('nennt die Firma nur, wenn die Person sie sehen darf', async () => {
    const firmen = dataSource.getRepository(CompanyEntity);
    const fremde = await firmen.save(
      firmen.create({ workspaceId, name: 'Geheim GmbH', ownerId: annaId }),
    );
    const eigene = await firmen.save(
      firmen.create({ workspaceId, name: 'Meine KG', ownerId: jonasId }),
    );

    nurEigeneFirmen = [jonasId];
    await aufgabe({
      title: 'Fremde anrufen',
      dueDate: '2026-03-10',
      assigneeId: jonasId,
      companyId: fremde.id,
    });
    await aufgabe({
      title: 'Eigene anrufen',
      dueDate: '2026-03-10',
      assigneeId: jonasId,
      companyId: eigene.id,
    });

    await service.run('2026-03-10');

    const anJonas = versandt.find((mail) => mail.to === 'jonas@wir.de');

    expect(anJonas?.text).toContain('Fremde anrufen');
    expect(anJonas?.text).not.toContain('Geheim GmbH');
    expect(anJonas?.text).toContain('Meine KG');
  });

  it('schickt am selben Tag keine zweite', async () => {
    await aufgabe({
      title: 'Etwas',
      dueDate: '2026-03-10',
      assigneeId: annaId,
    });

    await service.run('2026-03-10');
    const zweiter = await service.run('2026-03-10');

    expect(zweiter.sent).toBe(0);
    expect(versandt).toHaveLength(1);
  });

  it('schickt am nächsten Tag wieder', async () => {
    await aufgabe({
      title: 'Etwas',
      dueDate: '2026-03-10',
      assigneeId: annaId,
    });

    await service.run('2026-03-10');
    await service.run('2026-03-11');

    expect(versandt).toHaveLength(2);
  });

  it('hakt den Tag auch dann ab, wenn nichts hinausging', async () => {
    await service.run('2026-03-10');

    const membership = await dataSource
      .getRepository(MembershipEntity)
      .findOne({ where: { workspaceId, userId: annaId } });

    expect(membership?.lastDigestOn).toBe('2026-03-10');
  });

  it('lässt aus, wer sie abgeschaltet hat', async () => {
    await dataSource
      .getRepository(MembershipEntity)
      .update({ workspaceId, userId: annaId }, { taskDigest: false });
    await aufgabe({
      title: 'Etwas',
      dueDate: '2026-03-01',
      assigneeId: annaId,
    });

    await service.run('2026-03-10');

    expect(versandt).toHaveLength(0);
  });

  it('nimmt keine Aufgaben aus einem anderen Arbeitsbereich mit', async () => {
    const memberships = dataSource.getRepository(MembershipEntity);

    await memberships.save(
      memberships.create({
        workspaceId: otherWorkspaceId,
        userId: annaId,
        role: MembershipRole.MEMBER,
        taskDigest: true,
      }),
    );

    await aufgabe({
      title: 'Aufgabe im anderen Bereich',
      dueDate: '2026-03-01',
      assigneeId: annaId,
      workspace: otherWorkspaceId,
    });
    await aufgabe({
      title: 'Aufgabe bei uns',
      dueDate: '2026-03-01',
      assigneeId: annaId,
    });

    const vorschau = await service.preview(workspaceId, annaId, '2026-03-10');

    expect(vorschau?.body).toContain('Aufgabe bei uns');
    expect(vorschau?.body).not.toContain('Aufgabe im anderen Bereich');
  });

  it('übergeht erledigte Aufgaben', async () => {
    await aufgabe({
      title: 'Schon fertig',
      dueDate: '2026-03-01',
      assigneeId: annaId,
      done: true,
    });

    expect((await service.run('2026-03-10')).sent).toBe(0);
  });

  it('übergeht Aufgaben ohne Termin', async () => {
    await aufgabe({ title: 'Irgendwann', dueDate: null, assigneeId: annaId });

    expect((await service.run('2026-03-10')).sent).toBe(0);
  });
});

describe('die Vorschau', () => {
  it('zeigt, was hinausginge, ohne etwas zu verschicken', async () => {
    await aufgabe({
      title: 'Angebot nachfassen',
      dueDate: '2026-03-01',
      assigneeId: annaId,
    });

    const vorschau = await service.preview(workspaceId, annaId, '2026-03-10');

    expect(vorschau?.body).toContain('Angebot nachfassen');
    expect(vorschau?.body).toContain('Guten Morgen Anna');
    expect(versandt).toHaveLength(0);
  });

  it('antwortet mit nichts, wenn es nichts zu sagen gibt', async () => {
    expect(await service.preview(workspaceId, annaId, '2026-03-10')).toBeNull();
  });

  it('antwortet mit nichts für jemanden ohne Mitgliedschaft', async () => {
    expect(
      await service.preview(
        workspaceId,
        '00000000-0000-0000-0000-000000000000',
        '2026-03-10',
      ),
    ).toBeNull();
  });
});

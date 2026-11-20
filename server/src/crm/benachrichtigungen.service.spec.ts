import { type ConfigService } from '@nestjs/config';
import { type DataSource } from 'typeorm';

import { ApiKeyEntity } from '../api-keys/api-key.entity';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { type Mail, type MailService } from '../mail/mail.service';
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
import { BenachrichtigungenService } from './benachrichtigungen.service';
import { BenachrichtigungEntity } from './entities/benachrichtigung.entity';
import { CompanyEntity } from './entities/company.entity';
import { ContactEntity } from './entities/contact.entity';
import { DealEntity } from './entities/deal.entity';
import { NoteEntity } from './entities/note.entity';
import { TaskEntity } from './entities/task.entity';
import { NotesResolver } from './notes.resolver';
import { NotesService } from './notes.service';
import { TasksResolver } from './tasks.resolver';
import { TasksService } from './tasks.service';

const SUITE = 'erwaehnungen';

jest.setTimeout(60_000);

let dataSource: DataSource;
let permissions: PermissionsService;
let notes: NotesService;
let tasks: TasksService;
let service: BenachrichtigungenService;
let workspaceId: string;
let anna: RequestUser;
let ben: RequestUser;
let carla: RequestUser;
let fremdId: string;
let annasGeschaeft: string;
let versandt: Mail[] = [];

const erwaehne = (wer: RequestUser, name: string): string =>
  `@[${name}](nutzer:${wer.userId})`;

const als = <T>(wer: RequestUser, tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: 'test' }, () => {
    setzeSichtfeld(() => permissions.sichtfeldFuer(wer));

    return tun();
  });

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  permissions = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );
  const felder = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );

  notes = new NotesService(dataSource.getRepository(NoteEntity), felder);
  tasks = new TasksService(dataSource.getRepository(TaskEntity), felder);
  service = new BenachrichtigungenService(
    dataSource.getRepository(BenachrichtigungEntity),
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(UserEntity),
    dataSource.getRepository(CompanyEntity),
    dataSource.getRepository(ContactEntity),
    dataSource.getRepository(DealEntity),
    notes,
    tasks,
    permissions,
    {
      send: (mail: Mail) => {
        versandt.push(mail);

        return Promise.resolve(true);
      },
    } as unknown as MailService,
    { get: () => 'https://crm.example.de' } as unknown as ConfigService,
  );

  const bereiche = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await bereiche.save(bereiche.create({ name: 'Wir', slug: 'wir-erw' }))
  ).id;

  const fremderBereich = (
    await bereiche.save(bereiche.create({ name: 'Andere', slug: 'andere-erw' }))
  ).id;

  const users = dataSource.getRepository(UserEntity);
  const person = async (vorname: string) =>
    users.save(
      users.create({
        email: `${vorname.toLowerCase()}@erw.test`,
        passwordHash: 'x',
        firstName: vorname,
        lastName: 'Test',
      }),
    );
  const a = await person('Anna');
  const b = await person('Ben');
  const c = await person('Carla');
  const fremd = await person('Fremd');

  fremdId = fremd.id;

  const roles = dataSource.getRepository(RoleEntity);
  const owner = await roles.save(
    roles.create({
      workspaceId,
      name: 'Inhaber',
      templateKey: 'owner',
      everything: true,
      permissions: [],
      isSystem: true,
    }),
  );
  const eigene = await roles.save(
    roles.create({
      workspaceId,
      name: 'Außendienst',
      everything: false,
      permissions: [Permission.DEAL_VIEW, Permission.DEAL_WRITE],
      sichtbarkeit: { company: 'alle', contact: 'alle', deal: 'eigene' },
      isSystem: false,
    }),
  );

  const memberships = dataSource.getRepository(MembershipEntity);

  await memberships.save([
    memberships.create({
      userId: a.id,
      workspaceId,
      role: MembershipRole.OWNER,
      roleId: owner.id,
    }),
    memberships.create({
      userId: b.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: eigene.id,
    }),
    memberships.create({
      userId: c.id,
      workspaceId,
      role: MembershipRole.OWNER,
      roleId: owner.id,
      erwaehnungMail: false,
    }),
    memberships.create({
      userId: fremd.id,
      workspaceId: fremderBereich,
      role: MembershipRole.OWNER,
    }),
  ]);

  anna = { userId: a.id, workspaceId, email: a.email };
  ben = { userId: b.id, workspaceId, email: b.email };
  carla = { userId: c.id, workspaceId, email: c.email };

  const deals = dataSource.getRepository(DealEntity);

  annasGeschaeft = (
    await deals.save(
      deals.create({ workspaceId, name: 'Großauftrag Nord', ownerId: a.id }),
    )
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  versandt = [];
  await dataSource.query('DELETE FROM "benachrichtigungen"');
});

const notiz = async (body: string): Promise<NoteEntity> =>
  dataSource.getRepository(NoteEntity).save(
    dataSource.getRepository(NoteEntity).create({
      workspaceId,
      body,
      authorId: anna.userId,
      dealId: annasGeschaeft,
    }),
  );

describe('Erwähnungen', () => {
  it('benachrichtigt nur Mitglieder dieses Bereichs, nie sich selbst', async () => {
    const text = `${erwaehne(ben, 'Ben')} ${erwaehne(carla, 'Carla')} ${erwaehne(anna, 'Anna')} @[Fremd](nutzer:${fremdId})`;
    const note = await notiz(text);

    const neu = await service.nachDemSpeichern(
      workspaceId,
      anna.userId,
      { noteId: note.id },
      null,
      text,
    );

    expect(neu.sort()).toEqual([ben.userId, carla.userId].sort());
    expect(await service.ungelesen(ben.userId, workspaceId)).toBe(1);
    expect(await service.ungelesen(anna.userId, workspaceId)).toBe(0);
  });

  it('meldet niemanden zweimal, auch nicht nach Bearbeiten', async () => {
    const vorher = `Hallo ${erwaehne(ben, 'Ben')}`;
    const note = await notiz(vorher);

    await service.nachDemSpeichern(
      workspaceId,
      anna.userId,
      { noteId: note.id },
      null,
      vorher,
    );

    await service.nachDemSpeichern(
      workspaceId,
      anna.userId,
      { noteId: note.id },
      'ohne',
      vorher,
    );
    const nachher = `${vorher} und ${erwaehne(carla, 'Carla')}`;
    const neu = await service.nachDemSpeichern(
      workspaceId,
      anna.userId,
      { noteId: note.id },
      vorher,
      nachher,
    );

    expect(neu).toEqual([carla.userId]);
    expect(await service.ungelesen(ben.userId, workspaceId)).toBe(1);
  });

  it('schickt eine Mail nur, wer sie will, und ohne den Text', async () => {
    const text = `Bitte prüfen, Preis 4.800 € ${erwaehne(ben, 'Ben')} ${erwaehne(carla, 'Carla')}`;
    const note = await notiz(text);

    await service.nachDemSpeichern(
      workspaceId,
      anna.userId,
      { noteId: note.id },
      null,
      text,
    );

    expect(versandt.map((mail) => mail.to)).toEqual(['ben@erw.test']);
    expect(versandt[0].subject).toBe('Anna Test hat Sie erwähnt');
    expect(versandt[0].text).not.toContain('4.800');
    expect(versandt[0].text).not.toContain('Großauftrag');
    expect(versandt[0].text).toContain('https://crm.example.de/');
  });

  it('zeigt den Inhalt nur, wer die Akte sehen darf', async () => {
    const note = await notiz(`Für ${erwaehne(ben, 'Ben')}`);

    expect(
      await als(ben, () => service.einsicht(ben, { noteId: note.id })),
    ).toBe(null);
    expect(
      await als(carla, () => service.einsicht(carla, { noteId: note.id })),
    ).toEqual({
      text: `Für ${erwaehne(ben, 'Ben')}`,
      akte: { typ: 'deal', id: annasGeschaeft, name: 'Großauftrag Nord' },
      pfad: `/geschaefte/${annasGeschaeft}`,
    });
  });

  it('nennt bei einer Aufgabe die Akte nur, wenn man sie sieht', async () => {
    const task = await tasks.create(workspaceId, {
      title: 'Rückruf',
      description: `Bitte ${erwaehne(carla, 'Carla')}`,
      assigneeId: anna.userId,
      createdById: anna.userId,
      dealId: annasGeschaeft,
    });

    const einsicht = await als(carla, () =>
      service.einsicht(carla, { taskId: task.id }),
    );

    expect(einsicht?.akte?.name).toBe('Großauftrag Nord');
    expect(einsicht?.pfad).toBe(`/aufgaben?aufgabe=${task.id}`);
    expect(
      await als(ben, () => service.einsicht(ben, { taskId: task.id })),
    ).toBe(null);
  });

  it('markiert nur die eigenen als gelesen', async () => {
    const text = `${erwaehne(ben, 'Ben')} ${erwaehne(carla, 'Carla')}`;
    const note = await notiz(text);

    await service.nachDemSpeichern(
      workspaceId,
      anna.userId,
      { noteId: note.id },
      null,
      text,
    );

    const [bens] = await service.liste(ben.userId, workspaceId, 10);

    expect(await service.gelesen(carla.userId, workspaceId, bens.id)).toBe(0);
    expect(await service.gelesen(ben.userId, workspaceId, bens.id)).toBe(1);
    expect(await service.ungelesen(carla.userId, workspaceId)).toBe(1);
    expect(await service.gelesen(carla.userId, workspaceId)).toBe(1);
  });

  it('verschwindet mit der Notiz', async () => {
    const text = erwaehne(ben, 'Ben');
    const note = await notiz(text);

    await service.nachDemSpeichern(
      workspaceId,
      anna.userId,
      { noteId: note.id },
      null,
      text,
    );
    await dataSource.getRepository(NoteEntity).delete(note.id);

    expect(await service.ungelesen(ben.userId, workspaceId)).toBe(0);
  });
});

describe('Erwähnung durch einen Schlüssel', () => {
  const schluessel = async (
    createdById: string | null,
  ): Promise<RequestUser> => {
    const keys = dataSource.getRepository(ApiKeyEntity);
    const key = await keys.save(
      keys.create({
        workspaceId,
        name: 'MCP',
        kennung: `k${String(Math.random()).slice(2, 14)}`,
        hash: 'x',
        permissions: [Permission.DEAL_WRITE, Permission.TASK_WRITE],
        createdById,
      }),
    );

    return {
      userId: key.id,
      workspaceId,
      email: '',
      apiKey: { id: key.id, name: key.name, permissions: key.permissions },
    };
  };

  const von = async (empfaengerId: string): Promise<(string | null)[]> =>
    (
      await dataSource
        .getRepository(BenachrichtigungEntity)
        .findBy({ empfaengerId })
    ).map((zeile) => zeile.vonId);

  it('legt die Notiz an und meldet im Namen dessen, der den Schlüssel anlegte', async () => {
    const mcp = await schluessel(anna.userId);
    const resolver = new NotesResolver(
      notes,
      permissions,
      dataSource.getRepository(UserEntity),
      service,
    );

    const note = await als(mcp, () =>
      resolver.createNote(mcp, {
        body: `Bitte ansehen ${erwaehne(ben, 'Ben')}`,
        dealId: annasGeschaeft,
      }),
    );

    expect(note.id).toBeDefined();
    expect(await von(ben.userId)).toEqual([anna.userId]);
    expect(versandt[0].subject).toBe('Anna Test hat Sie erwähnt');
  });

  it('ändert die Aufgabe auch ohne Urheber des Schlüssels', async () => {
    const mcp = await schluessel(null);
    const resolver = new TasksResolver(
      tasks,
      permissions,
      dataSource.getRepository(UserEntity),
      service,
    );
    const task = await tasks.create(workspaceId, {
      title: 'Nachfassen',
      assigneeId: anna.userId,
      createdById: anna.userId,
    });

    const neu = await als(mcp, () =>
      resolver.updateTask(mcp, {
        id: task.id,
        description: `Für ${erwaehne(ben, 'Ben')}`,
      }),
    );

    expect(neu.description).toContain('nutzer:');
    expect(await von(ben.userId)).toEqual([null]);
    expect(versandt[0].subject).toBe('Jemand hat Sie erwähnt');
  });

  it('meldet einen Fehler beim Benachrichtigen nicht als gescheitertes Speichern', async () => {
    const note = await notiz(`Für ${erwaehne(ben, 'Ben')}`);
    const fehler = jest
      .spyOn(service, 'nachDemSpeichern')
      .mockRejectedValueOnce(new Error('Datenbank weg'));

    await expect(
      service.nachDemSpeichernVon(anna, { noteId: note.id }, null, note.body),
    ).resolves.toEqual([]);
    fehler.mockRestore();
  });
});

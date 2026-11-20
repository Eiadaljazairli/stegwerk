import { BadRequestException, NotFoundException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { rechteFuerZiel, zielMitAkte } from '../attachments/attachment-rechte';
import { AttachmentEntity } from '../attachments/attachment.entity';
import { AttachmentsService } from '../attachments/attachments.service';
import { aufgabeAlsEvent } from '../calendar/aufgaben-im-kalender';
import { instantFromBerlin } from '../calendar/berlin-time';
import { buildIcs } from '../calendar/ics';
import { liesIcs } from '../calendar/ics-lesen';
import { pruefeVideoLink, videoLinkOderNull } from '../calendar/video-link';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { digestText, groupTasks } from '../reminders/task-digest';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { Permission } from '../workspaces/permissions';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { istUeberfaellig, statusVon } from './aufgaben-status';
import { DealEntity } from './entities/deal.entity';
import { NoteEntity } from './entities/note.entity';
import { TaskEntity } from './entities/task.entity';
import { TasksService } from './tasks.service';

const SUITE = 'e5_aufgaben_termine';

jest.setTimeout(60_000);

let dataSource: DataSource;
let aufgaben: TasksService;
let anhaenge: AttachmentsService;
let workspaceId: string;
let fremderBereich: string;
let userId: string;
let dealId: string;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  aufgaben = new TasksService(
    dataSource.getRepository(TaskEntity),
    new CustomFieldsService(dataSource.getRepository(CustomFieldDefinition)),
  );
  anhaenge = new AttachmentsService(
    dataSource.getRepository(AttachmentEntity),
    dataSource,
  );

  const bereiche = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (await bereiche.save({ name: 'Wir', slug: 'e5-wir' })).id;
  fremderBereich = (await bereiche.save({ name: 'Andere', slug: 'e5-andere' }))
    .id;
  userId = (
    await dataSource.getRepository(UserEntity).save({
      email: 'e5@stegwerk.test',
      passwordHash: 'x',
      firstName: 'E',
      lastName: 'Fünf',
    })
  ).id;
  await dataSource.query(
    `INSERT INTO memberships ("userId", "workspaceId", role) VALUES ($1, $2, 'owner')`,
    [userId, workspaceId],
  );
  dealId = (
    await dataSource
      .getRepository(DealEntity)
      .save({ workspaceId, name: 'Großauftrag' })
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

const neueAufgabe = (titel: string, extra: Partial<TaskEntity> = {}) =>
  aufgaben.createForTarget(
    workspaceId,
    userId,
    { title: titel, ...extra },
    { dealId },
  );

describe('Stand einer Aufgabe', () => {
  it('geht von offen über in Arbeit zu erledigt und zurück', async () => {
    const a = await neueAufgabe('Angebot nachfassen');

    expect(statusVon(a)).toBe('offen');

    const inArbeit = await aufgaben.setStatus(workspaceId, a.id, 'in_arbeit');

    expect(statusVon(inArbeit)).toBe('in_arbeit');
    expect(inArbeit.inArbeitSeit).not.toBeNull();

    const liste = await aufgaben.list(workspaceId, {}, { status: 'in_arbeit' });

    expect(liste.items.map((t) => t.id)).toContain(a.id);
    expect(
      (await aufgaben.list(workspaceId, {}, { status: 'offen' })).items.map(
        (t) => t.id,
      ),
    ).not.toContain(a.id);

    const erledigt = await aufgaben.setStatus(workspaceId, a.id, 'erledigt');

    expect(statusVon(erledigt)).toBe('erledigt');

    const wieder = await aufgaben.setCompleted(workspaceId, a.id, false);

    expect(statusVon(wieder)).toBe('offen');
  });
});

describe('Fälligkeit mit Uhrzeit', () => {
  it('ist am selben Tag erst nach der Uhrzeit überfällig', () => {
    const jetzt = instantFromBerlin('2026-10-21', '14:00');
    const aufgabe = { completedAt: null, dueDate: '2026-10-21' };

    expect(istUeberfaellig({ ...aufgabe, dueTime: '13:59' }, jetzt)).toBe(true);
    expect(istUeberfaellig({ ...aufgabe, dueTime: '14:30' }, jetzt)).toBe(
      false,
    );
    expect(istUeberfaellig({ ...aufgabe, dueTime: null }, jetzt)).toBe(false);
  });

  it('filtert überfällige in Berliner Zeit und vergisst die Uhrzeit ohne Datum', async () => {
    const gestern = await neueAufgabe('Gestern', { dueDate: '2000-01-01' });
    const morgen = await neueAufgabe('Morgen', {
      dueDate: '2999-01-01',
      dueTime: '00:00',
    });
    const ueberfaellig = (
      await aufgaben.list(workspaceId, {}, { overdue: true })
    ).items.map((t) => t.id);

    expect(ueberfaellig).toContain(gestern.id);
    expect(ueberfaellig).not.toContain(morgen.id);

    const ohneDatum = await aufgaben.update(workspaceId, morgen.id, {
      dueDate: null,
    } as never);

    expect(ohneDatum.dueTime).toBeNull();
  });

  it('lehnt eine Uhrzeit ohne Datum ab, statt sie still zu verwerfen', async () => {
    await expect(neueAufgabe('Ohne Tag', { dueTime: '09:30' })).rejects.toThrow(
      'Eine Uhrzeit braucht ein Fälligkeitsdatum.',
    );

    const ohneTag = await neueAufgabe('Erst ohne Tag');

    await expect(
      aufgaben.update(workspaceId, ohneTag.id, { dueTime: '09:30' }),
    ).rejects.toThrow('Fälligkeitsdatum');
    await expect(
      aufgaben.update(workspaceId, ohneTag.id, {
        dueDate: null,
        dueTime: '09:30',
      } as never),
    ).rejects.toThrow('Fälligkeitsdatum');

    await aufgaben.update(workspaceId, ohneTag.id, { dueDate: '2026-10-22' });
    await expect(
      aufgaben.update(workspaceId, ohneTag.id, { dueTime: '09:30' }),
    ).resolves.toMatchObject({ dueTime: '09:30' });
  });

  it('lehnt eine Uhrzeit ab, die keine ist', async () => {
    await expect(
      neueAufgabe('Kaputt', { dueDate: '2026-10-21', dueTime: '25:00' }),
    ).rejects.toThrow();
  });

  it('sortiert die Tagespost nach Uhrzeit und nennt sie', () => {
    const gruppen = groupTasks(
      [
        {
          id: '1',
          title: 'Später',
          dueOn: '2026-10-21',
          dueTime: '16:00',
          done: false,
          context: null,
        },
        {
          id: '2',
          title: 'Ganztags',
          dueOn: '2026-10-21',
          dueTime: null,
          done: false,
          context: null,
        },
        {
          id: '3',
          title: 'Früh',
          dueOn: '2026-10-21',
          dueTime: '08:30',
          done: false,
          context: null,
          inArbeit: true,
        },
      ],
      '2026-10-21',
    );

    expect(gruppen.today.map((t) => t.title)).toEqual([
      'Früh',
      'Später',
      'Ganztags',
    ]);

    const text = digestText(gruppen, 'Eva', 'https://app/aufgaben');

    expect(text).toContain('Früh — 21.10.2026, 08:30 Uhr');
    expect(text).toContain('[in Arbeit]');
  });

  it('steht im Abo zur Uhrzeit, ohne Uhrzeit ganztägig', () => {
    const mit = buildIcs([
      aufgabeAlsEvent(
        {
          id: 'a1',
          title: 'Rückruf',
          description: null,
          dueDate: '2026-10-21',
          dueTime: '14:00',
          updatedAt: new Date(),
        },
        'stegwerk.test',
      ),
    ]);

    expect(mit).toContain('DTSTART:20261021T120000Z');
    expect(mit).toContain('DTEND:20261021T123000Z');
    expect(mit).toContain('SUMMARY:Aufgabe: Rückruf');
    expect(mit).toContain('UID:aufgabe-a1@stegwerk.test');

    const ohne = buildIcs([
      aufgabeAlsEvent(
        {
          id: 'a2',
          title: 'Ablage',
          description: null,
          dueDate: '2026-10-21',
          dueTime: null,
          updatedAt: new Date(),
        },
        'stegwerk.test',
      ),
    ]);

    expect(ohne).toContain('DTSTART;VALUE=DATE:20261021');
    expect(ohne).toContain('DTEND;VALUE=DATE:20261022');
  });
});

describe('Dateien an Aufgaben und Notizen', () => {
  it('erben die Rechte der Akte dahinter', async () => {
    const aufgabe = await neueAufgabe('Mit Anhang');
    const notiz = await dataSource
      .getRepository(NoteEntity)
      .save({ workspaceId, body: 'Gesprächsnotiz', dealId, authorId: userId });

    const anAufgabe = await zielMitAkte(dataSource.manager, workspaceId, {
      taskId: aufgabe.id,
    });

    expect(rechteFuerZiel(anAufgabe, 'sehen').sort()).toEqual(
      [Permission.TASK_VIEW, Permission.DEAL_VIEW].sort(),
    );
    expect(rechteFuerZiel(anAufgabe, 'aendern').sort()).toEqual(
      [Permission.TASK_WRITE, Permission.DEAL_VIEW].sort(),
    );

    const anNotiz = await zielMitAkte(dataSource.manager, workspaceId, {
      noteId: notiz.id,
    });

    expect(rechteFuerZiel(anNotiz, 'sehen')).toEqual([Permission.DEAL_VIEW]);
    expect(rechteFuerZiel(anNotiz, 'aendern')).toEqual([Permission.DEAL_WRITE]);
  });

  it('hängen nicht an der Aufgabe eines fremden Bereichs', async () => {
    const aufgabe = await neueAufgabe('Unsere');

    await expect(
      anhaenge.create({
        workspaceId: fremderBereich,
        userId,
        name: 'x.pdf',
        mimeType: 'application/pdf',
        bytes: Buffer.from('%PDF-1.4'),
        ziel: { taskId: aufgabe.id },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      zielMitAkte(dataSource.manager, workspaceId, { taskId: 'kein-uuid' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('gehen mit der Notiz und sind an der Aufgabe im Papierkorb nicht erreichbar', async () => {
    const aufgabe = await neueAufgabe('Mit Datei');
    const notiz = await dataSource
      .getRepository(NoteEntity)
      .save({ workspaceId, body: 'Mit Datei', dealId, authorId: userId });

    for (const ziel of [{ taskId: aufgabe.id }, { noteId: notiz.id }]) {
      await anhaenge.create({
        workspaceId,
        userId,
        name: 'beleg.pdf',
        mimeType: 'application/pdf',
        bytes: Buffer.from('%PDF-1.4'),
        ziel,
      });
    }

    expect(
      await anhaenge.list(workspaceId, { taskId: aufgabe.id }),
    ).toHaveLength(1);

    await dataSource.getRepository(NoteEntity).delete({ id: notiz.id });

    expect(
      await dataSource
        .getRepository(AttachmentEntity)
        .countBy({ noteId: notiz.id }),
    ).toBe(0);

    await aufgaben.remove(workspaceId, aufgabe.id, userId);

    await expect(
      anhaenge.mitAkte(workspaceId, { taskId: aufgabe.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Videolink am Termin', () => {
  it('nimmt nur https ohne Zugangsdaten', () => {
    expect(pruefeVideoLink('  https://meet.example.org/abc-def ')).toBe(
      'https://meet.example.org/abc-def',
    );
    expect(pruefeVideoLink('')).toBeNull();

    for (const schlecht of [
      'http://meet.example.org/x',
      'javascript:alert(1)',
      'https://nutzer:pw@meet.example.org/',
      'https://meet.example.org/a b',
      `https://meet.example.org/${'x'.repeat(500)}`,
      'keine adresse',
    ]) {
      expect(() => pruefeVideoLink(schlecht)).toThrow(BadRequestException);
    }

    expect(videoLinkOderNull('http://unsicher.example')).toBeNull();
  });

  it('steht als URL und ohne Ort auch als Ort in der Datei und kommt so zurück', () => {
    const link = 'https://meet.example.org/abc?pwd=1,2';
    const datei = buildIcs([
      {
        uid: 't1@stegwerk.test',
        startsAt: new Date('2026-10-21T12:00:00Z'),
        endsAt: new Date('2026-10-21T13:00:00Z'),
        summary: 'Abstimmung',
        videoLink: link,
      },
    ]);

    expect(datei).toContain(`URL:${link}`);
    expect(datei).toContain('LOCATION:https://meet.example.org/abc?pwd=1\\,2');

    const [gelesen] = liesIcs(datei).termine;

    expect(gelesen.url).toBe(link);
    expect(gelesen.ort).toBe(link);

    const mitOrt = buildIcs([
      {
        uid: 't2@stegwerk.test',
        startsAt: new Date('2026-10-21T12:00:00Z'),
        endsAt: new Date('2026-10-21T13:00:00Z'),
        summary: 'Vor Ort',
        location: 'Hafenstraße 1',
        videoLink: link,
      },
    ]);

    expect(mitOrt).toContain('LOCATION:Hafenstraße 1');
    expect(mitOrt).toContain(`URL:${link}`);
  });
});

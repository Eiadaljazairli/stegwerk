import { BadRequestException, NotFoundException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { NoteEntity } from '../crm/entities/note.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import {
  alsKlartext,
  erwaehnteNutzer,
  unerlaubteLinks,
} from '../crm/formatierter-text';
import { LetterheadEntity } from '../quotes/letterhead.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { WebFormEntity } from './web-form.entity';
import { berlinDate } from '../calendar/berlin-time';
import {
  ANFRAGEN_JE_TAG,
  teileName,
  WebFormsService,
} from './web-forms.service';

const SUITE = 'web_forms';

jest.setTimeout(60_000);

let dataSource: DataSource;
let forms: WebFormsService;
let workspaceId: string;
let mails: { to: string; subject: string; html?: string }[];

const ANFRAGE = {
  name: 'Erika Muster',
  email: 'Erika@Kunde.test',
  company: 'Kunde GmbH',
  message: 'Bitte um ein Angebot.',
  consent: true,
};

const abo = {
  abgelaufen: new Set<string>(),
  assertCanWrite(workspaceId: string): Promise<void> {
    return this.abgelaufen.has(workspaceId)
      ? Promise.reject(new Error('Abo abgelaufen'))
      : Promise.resolve();
  },
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  mails = [];
  forms = new WebFormsService(
    dataSource.getRepository(WebFormEntity),
    dataSource.getRepository(LetterheadEntity),
    dataSource.getRepository(UserEntity),
    dataSource,
    {
      send: (mail: { to: string; subject: string; html?: string }) => {
        mails.push(mail);

        return Promise.resolve(true);
      },
    } as never,
    { get: () => 'https://stegwerk.test' } as never,
    abo as never,
  );

  const m = dataSource.manager;

  workspaceId = (
    await m.save(m.create(WorkspaceEntity, { name: 'Form', slug: 'form' }))
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

const besitzer = async (): Promise<UserEntity> => {
  const users = dataSource.getRepository(UserEntity);

  return users.save(
    users.create({
      email: `form-${String(Math.random()).slice(2)}@firma.test`,
      passwordHash: 'x',
      firstName: 'Anna',
      lastName: 'Form',
    }),
  );
};

const zaehle = () =>
  Promise.all([
    dataSource.getRepository(ContactEntity).countBy({ workspaceId }),
    dataSource.getRepository(DealEntity).countBy({ workspaceId }),
    dataSource.getRepository(TaskEntity).countBy({ workspaceId }),
    dataSource.getRepository(NoteEntity).countBy({ workspaceId }),
  ]);

describe('teileName', () => {
  it('trennt den letzten Teil als Nachnamen ab', () => {
    expect(teileName(' Anna  Maria Muster ')).toEqual({
      firstName: 'Anna Maria',
      lastName: 'Muster',
    });
    expect(teileName('Erika')).toEqual({ firstName: 'Erika', lastName: '' });
  });
});

describe('WebFormsService', () => {
  let formId: string;
  let anna: UserEntity;

  beforeAll(async () => {
    anna = await besitzer();
    formId = (await forms.save(workspaceId, anna.id, {})).id;
  });

  it('legt Kontakt, Firma, Notiz, Geschäft und Aufgabe an und meldet es', async () => {
    mails.length = 0;

    await expect(forms.submit(formId, ANFRAGE)).resolves.toEqual({ ok: true });

    const kontakt = await dataSource
      .getRepository(ContactEntity)
      .findOneOrFail({ where: { workspaceId }, relations: { company: true } });

    expect(kontakt).toMatchObject({
      firstName: 'Erika',
      lastName: 'Muster',
      email: 'erika@kunde.test',
    });
    expect(kontakt.company?.name).toBe('Kunde GmbH');

    const aufgabe = await dataSource
      .getRepository(TaskEntity)
      .findOneByOrFail({ workspaceId });

    expect(aufgabe.assigneeId).toBe(anna.id);
    expect(await zaehle()).toEqual([1, 1, 1, 1]);
    expect(mails.map((mail) => mail.to)).toEqual([anna.email]);
  });

  it('legt für eine bekannte Adresse keinen zweiten Kontakt an', async () => {
    await forms.submit(formId, { ...ANFRAGE, email: 'erika@kunde.test' });

    const [kontakte, geschaefte] = await zaehle();

    expect(kontakte).toBe(1);
    expect(geschaefte).toBe(2);
  });

  it('nimmt Programme an, legt für sie aber nichts an', async () => {
    const vorher = await zaehle();

    await expect(
      forms.submit(formId, { ...ANFRAGE, website: 'https://spam.test' }),
    ).resolves.toEqual({ ok: true });
    expect(await zaehle()).toEqual(vorher);
  });

  it('verlangt Einwilligung und eine gültige Adresse', async () => {
    await expect(
      forms.submit(formId, { ...ANFRAGE, consent: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      forms.submit(formId, { ...ANFRAGE, email: 'keine-adresse' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ohne Geschäft, wenn abgewählt, und gar nicht, wenn abgeschaltet', async () => {
    await forms.save(workspaceId, anna.id, { createDeal: false });

    const [, vorher] = await zaehle();

    await forms.submit(formId, { ...ANFRAGE, email: 'neu@kunde.test' });
    expect((await zaehle())[1]).toBe(vorher);

    await forms.save(workspaceId, anna.id, { active: false });
    await expect(forms.publicView(formId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(forms.submit(formId, ANFRAGE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('schreibt kein HTML aus der Anfrage in die Mail', async () => {
    await forms.save(workspaceId, anna.id, { active: true });
    mails.length = 0;

    await forms.submit(formId, {
      ...ANFRAGE,
      name: 'Eve\r\nATTACH:https://boese.test',
      email: 'eve@kunde.test',
      message: '<a href="https://boese.test">Neu anmelden</a>',
    });

    expect(mails[0].html).not.toContain('<a href="https://boese.test"');
    expect(mails[0].html).toContain('&lt;a href=');
    expect(mails[0].subject).not.toMatch(/[\r\n]/u);

    await expect(
      forms.submit(formId, { ...ANFRAGE, email: 'a@b.c<img src=x>' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('nimmt Links und Erwähnungen des Besuchers nur als Text', async () => {
    const nachricht =
      '@[Geschäftsführung](nutzer:6f1c2a3b-0000-4000-8000-000000000001) ' +
      'bitte [Rechnung öffnen](https://phish.test) oder [x](javascript:1)\n# Wichtig';

    await forms.submit(formId, {
      ...ANFRAGE,
      email: 'phish@kunde.test',
      phone: '[x](javascript:1)',
      message: nachricht,
    });

    const kontakt = await dataSource
      .getRepository(ContactEntity)
      .findOneByOrFail({ workspaceId, email: 'phish@kunde.test' });
    const notiz = await dataSource
      .getRepository(NoteEntity)
      .findOneByOrFail({ workspaceId, contactId: kontakt.id });
    const aufgabe = await dataSource
      .getRepository(TaskEntity)
      .findOneByOrFail({ workspaceId, contactId: kontakt.id });

    for (const text of [notiz.body, aufgabe.description ?? '']) {
      expect(text).toContain('\\[Rechnung öffnen\\]\\(https://phish.test\\)');
      expect(erwaehnteNutzer(text)).toEqual([]);
      expect(unerlaubteLinks(text)).toEqual([]);
    }

    expect(alsKlartext(aufgabe.description ?? '')).toBe(nachricht);
    expect(notiz.body).toContain('Telefon: \\[x\\]\\(javascript:1\\)');
  });

  it('nimmt ohne laufendes Abo nichts an', async () => {
    await forms.save(workspaceId, anna.id, { active: true });
    abo.abgelaufen.add(workspaceId);

    try {
      await expect(forms.publicView(formId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        forms.submit(formId, { ...ANFRAGE, email: 'spaet@kunde.test' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      abo.abgelaufen.delete(workspaceId);
    }
  });

  it('nimmt am Tag nicht mehr als die Grenze an', async () => {
    await forms.save(workspaceId, anna.id, { active: true });
    await dataSource.query(
      `UPDATE "web_forms" SET "heuteAnzahl" = $1, "heuteDatum" = $2 WHERE "id" = $3`,
      [ANFRAGEN_JE_TAG, berlinDate(new Date()), formId],
    );

    await expect(
      forms.submit(formId, { ...ANFRAGE, email: 'flut@kunde.test' }),
    ).rejects.toThrow('sehr viele Anfragen');

    await dataSource.query(
      `UPDATE "web_forms" SET "heuteDatum" = '2000-01-01' WHERE "id" = $1`,
      [formId],
    );
    await expect(
      forms.submit(formId, { ...ANFRAGE, email: 'morgen@kunde.test' }),
    ).resolves.toEqual({ ok: true });
  });

  it('lehnt eine Datenschutzerklärung ohne https ab', async () => {
    await expect(
      forms.save(workspaceId, anna.id, { privacyUrl: 'javascript:alert(1)' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('legt das Geschäft in die erste sichtbare Phase der Standard-Pipeline', async () => {
    await dataSource.query(
      `INSERT INTO "deal_stage_settings" ("workspaceId", "pipelineId", stage, ausgeblendet)
       VALUES ($1, NULL, 'lead', true)`,
      [workspaceId],
    );
    await forms.save(workspaceId, anna.id, { active: true, createDeal: true });

    await forms.submit(formId, {
      ...ANFRAGE,
      email: 'sichtbar@kunde.test',
      company: 'Sichtbar GmbH',
    });

    const deal = await dataSource
      .getRepository(DealEntity)
      .findOneByOrFail({ workspaceId, name: 'Anfrage Sichtbar GmbH' });

    expect(deal.stage).toBe('qualified');
    expect(deal.pipelineId).not.toBeNull();

    await dataSource.query(
      `DELETE FROM "deal_stage_settings" WHERE "workspaceId" = $1`,
      [workspaceId],
    );
  });

  it('schickt die Anfrage an einen Inhaber, wenn die zuständige Person gegangen ist', async () => {
    const bea = await besitzer();

    await dataSource.query(
      `INSERT INTO "memberships" ("userId", "workspaceId", role) VALUES ($1, $2, 'owner')`,
      [bea.id, workspaceId],
    );
    mails.length = 0;

    await forms.submit(formId, { ...ANFRAGE, email: 'gegangen@kunde.test' });

    expect(mails.map((m) => m.to)).toEqual([bea.email]);

    const aufgabe = await dataSource.getRepository(TaskEntity).findOneByOrFail({
      workspaceId,
      title: `Anfrage beantworten: ${ANFRAGE.name}`,
      assigneeId: bea.id,
    });

    expect(aufgabe.assigneeId).toBe(bea.id);
  });
});

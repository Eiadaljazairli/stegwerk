import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { type ConfigService } from '@nestjs/config';
import { type ModuleRef } from '@nestjs/core';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import {
  buildSchema,
  getNullableType,
  type GraphQLOutputType,
  type GraphQLSchema,
  isEnumType,
  isListType,
  isObjectType,
} from 'graphql';
import { type DataSource, ILike } from 'typeorm';

import { NurMenschWache } from '../api-keys/api-key.guard';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { BillingService } from '../billing/billing.service';
import { DealEntity, DealStage } from '../crm/entities/deal.entity';
import { KiVorschlagEntity } from '../ki-vorschlaege/ki-vorschlag.entity';
import { KiVorschlaegeService } from '../ki-vorschlaege/ki-vorschlaege.service';
import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { Permission, ROLE_TEMPLATES } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { setzeSichtfeld } from '../workspaces/sichtbarkeit';
import { zielSichtbar } from '../workspaces/ziel-sichtbarkeit';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { type KiHttpAnfrage, type KiHttpAntwort } from './ki-anbieter';
import { KiDrossel } from './ki-drossel';
import { KiEinstellungEntity } from './ki-einstellung.entity';
import { KiResolver } from './ki.resolver';
import { GESAMTFRIST_MS, KiService, ohneMarkdown } from './ki.service';

const SUITE = 'ki_chat';
const SCHLUESSEL = 'sk-ant-api03-GEHEIM-nie-im-ergebnis-1234567890';
const MAIL_SCHLUESSEL = randomBytes(32).toString('base64');

jest.setTimeout(60_000);

let dataSource: DataSource;
let rechte: PermissionsService;
let dienst: KiService;
let resolver: KiResolver;
let bereich: string;
let fremderBereich: string;
let uhr = 0;
const leute = {} as Record<
  'inhaber' | 'aussendienst' | 'ohneKi' | 'fremd',
  RequestUser
>;

let anfragen: KiHttpAnfrage[] = [];
let antworten: KiHttpAntwort[] = [];

let transportHaken: (anfrage: KiHttpAnfrage) => void = () => undefined;

const transport = (anfrage: KiHttpAnfrage): Promise<KiHttpAntwort> => {
  anfragen.push(anfrage);

  try {
    transportHaken(anfrage);
  } catch (fehler) {
    return Promise.reject(fehler as Error);
  }

  const naechste = antworten.shift();

  if (naechste === undefined) {
    throw new Error('Keine Antwort vorbereitet.');
  }

  return Promise.resolve(naechste);
};

const json = (status: number, inhalt: unknown): KiHttpAntwort => ({
  status,
  rumpf: JSON.stringify(inhalt),
});

const claudeText = (text: string) =>
  json(200, {
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5 },
  });

const claudeWerkzeug = (name: string, input: Record<string, unknown>) =>
  json(200, {
    content: [
      { type: 'thinking', thinking: '', signature: 'sig-1' },
      { type: 'tool_use', id: 'toolu_1', name, input },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 10, output_tokens: 5 },
  });

const rumpf = (index: number) =>
  JSON.parse(anfragen[index].rumpf as string) as Record<string, unknown>;

const als = <T>(wer: RequestUser, tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: 'test' }, () => {
    setzeSichtfeld(() => rechte.sichtfeldFuer(wer));

    return tun();
  });

const anfrage = (wer: RequestUser) => ({ user: wer });

let aboGesperrt = false;
const abo = {
  assertCanWrite: () =>
    aboGesperrt
      ? Promise.reject(
          new ForbiddenException(
            'Your subscription is not active. Update your billing to continue.',
          ),
        )
      : Promise.resolve(),
};

const platzhalter = (typ: GraphQLOutputType): unknown => {
  const kern = getNullableType(typ);

  if (isListType(kern)) {
    return [];
  }

  if (isEnumType(kern)) {
    return kern.getValues()[0].value;
  }

  if (isObjectType(kern)) {
    return {};
  }

  return { Int: 0, Float: 0, Boolean: false }[String(kern)] ?? 'x';
};

type Kontext = { req: { user: RequestUser } };

const sichtbar = async (wer: RequestUser, deal: DealEntity) =>
  als(wer, () => zielSichtbar(dataSource.manager, { dealId: deal.id }));

const alsAntwort = (deal: DealEntity) => ({
  ...deal,
  stage: deal.stage.toUpperCase(),
});

const schemaMitGeschaeften = (): GraphQLSchema => {
  const schema = buildSchema(
    readFileSync(join(__dirname, '..', '..', 'schema.gql'), 'utf8'),
  );

  for (const typ of Object.values(schema.getTypeMap())) {
    if (isObjectType(typ) && !typ.name.startsWith('__')) {
      for (const feld of Object.values(typ.getFields())) {
        feld.resolve = (quelle: Record<string, unknown>) =>
          quelle[feld.name] ?? platzhalter(feld.type);
      }
    }
  }

  const query = schema.getQueryType()!.getFields();

  query.companies.resolve = async (_q, _a, { req }: Kontext) => {
    await rechte.assert(req.user, Permission.COMPANY_VIEW, 'Firmen zu sehen');

    return { totalCount: 0, items: [] };
  };
  query.contacts.resolve = async (_q, _a, { req }: Kontext) => {
    await rechte.assert(req.user, Permission.CONTACT_VIEW, 'Kontakte zu sehen');

    return { totalCount: 0, items: [] };
  };
  query.deals.resolve = async (
    _q,
    { search }: { search?: string },
    { req }: Kontext,
  ) => {
    await rechte.assert(req.user, Permission.DEAL_VIEW, 'Geschäfte zu sehen');

    const alle = await dataSource.getRepository(DealEntity).find({
      where: {
        workspaceId: req.user.workspaceId,
        name: ILike(`%${search ?? ''}%`),
      },
    });
    const items = [];

    for (const deal of alle) {
      if (await sichtbar(req.user, deal)) {
        items.push(alsAntwort(deal));
      }
    }

    return { totalCount: items.length, items };
  };
  query.deal.resolve = async (_q, { id }: { id: string }, { req }: Kontext) => {
    await rechte.assert(req.user, Permission.DEAL_VIEW, 'Geschäfte zu sehen');

    const deal = await dataSource
      .getRepository(DealEntity)
      .findOne({ where: { id, workspaceId: req.user.workspaceId } });

    if (deal === null || !(await sichtbar(req.user, deal))) {
      throw new Error('Dieses Geschäft gibt es nicht.');
    }

    return alsAntwort(deal);
  };
  schema.getMutationType()!.getFields().updateDeal.resolve = () => {
    throw new Error('Die KI darf nie selbst schreiben.');
  };

  return schema;
};

const geschaeft = (
  name: string,
  ownerId: string | null,
  workspaceId = bereich,
) =>
  dataSource.getRepository(DealEntity).save(
    dataSource.getRepository(DealEntity).create({
      workspaceId,
      name,
      stage: DealStage.LEAD,
      ownerId,
    }),
  );

const einrichten = (wer: RequestUser = leute.inhaber, nutzung = 'alle') => {
  antworten.push(json(200, { id: 'claude-sonnet-5-5', type: 'model' }));

  return dienst.einrichten(wer, {
    anbieter: 'anthropic',
    modell: 'claude-sonnet-5-5',
    schluessel: SCHLUESSEL,
    nutzung,
  });
};

const fragen = (wer: RequestUser, text: string) =>
  als(wer, () =>
    dienst.chat(wer, anfrage(wer), [{ rolle: 'user', text }], null),
  );

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  rechte = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );

  const schema = schemaMitGeschaeften();
  let vorschlaege: KiVorschlaegeService;
  const moduleRef = {
    get: (token: unknown) =>
      token === BillingService
        ? abo
        : token === KiVorschlaegeService
          ? vorschlaege
          : token === GraphQLSchemaHost
            ? { schema }
            : { schema },
  } as unknown as ModuleRef;

  vorschlaege = new KiVorschlaegeService(
    dataSource.getRepository(KiVorschlagEntity),
    rechte,
    moduleRef,
  );
  dienst = new KiService(
    dataSource.getRepository(KiEinstellungEntity),
    dataSource.getRepository(UserEntity),
    rechte,
    {
      get: (name: string) =>
        name === 'mailEncryptionKey' ? MAIL_SCHLUESSEL : undefined,
    } as unknown as ConfigService,
    moduleRef,
    transport,
    new KiDrossel(() => uhr),
  );
  resolver = new KiResolver(dienst, rechte);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE workspaces, users CASCADE');
  anfragen = [];
  antworten = [];
  aboGesperrt = false;
  uhr += 24 * 60 * 60_000;

  const m = dataSource.manager;

  bereich = (await m.save(m.create(WorkspaceEntity, { name: 'K', slug: 'k' })))
    .id;
  fremderBereich = (
    await m.save(m.create(WorkspaceEntity, { name: 'F', slug: 'f' }))
  ).id;

  const rolle = (name: string, permissions: Permission[], eigene = false) =>
    m.save(
      m.create(RoleEntity, {
        workspaceId: bereich,
        name,
        everything: false,
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
  const inhaberRolle = (workspaceId: string) =>
    m.save(
      m.create(RoleEntity, {
        workspaceId,
        name: ROLE_TEMPLATES[0].name,
        templateKey: 'owner',
        everything: true,
        permissions: [],
        isSystem: true,
      }),
    );
  const person = async (
    kurz: keyof typeof leute,
    workspaceId: string,
    roleId: string,
    enumRolle = MembershipRole.MEMBER,
  ) => {
    const user = await m.save(
      m.create(UserEntity, {
        email: `${kurz}@ki.test`,
        passwordHash: 'x',
        firstName: kurz,
        lastName: 'Test',
      }),
    );

    await m.save(
      m.create(MembershipEntity, {
        userId: user.id,
        workspaceId,
        role: enumRolle,
        roleId,
      }),
    );
    leute[kurz] = { userId: user.id, workspaceId, email: user.email };
  };

  await person(
    'inhaber',
    bereich,
    (await inhaberRolle(bereich)).id,
    MembershipRole.OWNER,
  );
  await person(
    'aussendienst',
    bereich,
    (
      await rolle(
        'Außendienst',
        [
          Permission.COMPANY_VIEW,
          Permission.CONTACT_VIEW,
          Permission.DEAL_VIEW,
          Permission.DEAL_WRITE,
        ],
        true,
      )
    ).id,
  );
  await person(
    'ohneKi',
    bereich,
    (await rolle('Ohne KI', [Permission.DEAL_VIEW])).id,
  );
  await person(
    'fremd',
    fremderBereich,
    (await inhaberRolle(fremderBereich)).id,
    MembershipRole.OWNER,
  );
});

describe('einrichten', () => {
  it('prüft Schlüssel und Modell beim Anbieter und speichert versiegelt', async () => {
    const einstellung = await einrichten();

    expect(anfragen[0]).toMatchObject({
      methode: 'GET',
      url: 'https://api.anthropic.com/v1/models/claude-sonnet-5-5',
    });
    expect(anfragen[0].headers['x-api-key']).toBe(SCHLUESSEL);
    expect(einstellung).toMatchObject({
      anbieter: 'anthropic',
      modell: 'claude-sonnet-5-5',
      nutzung: 'alle',
    });

    const [zeile] = (await dataSource.query(
      `SELECT "schluesselVersiegelt" FROM "ki_einstellungen"`,
    )) as { schluesselVersiegelt: string }[];

    expect(zeile.schluesselVersiegelt.startsWith('v2:')).toBe(true);
    expect(zeile.schluesselVersiegelt).not.toContain('GEHEIM');
    expect(
      JSON.stringify(await resolver.kiEinstellung(leute.ohneKi)),
    ).not.toContain('GEHEIM');
  });

  it('speichert nichts, was der Anbieter ablehnt, und nennt den Schlüssel nicht', async () => {
    antworten.push(
      json(401, { error: { type: 'authentication_error', message: 'x' } }),
    );

    const versuch = dienst.einrichten(leute.inhaber, {
      anbieter: 'anthropic',
      modell: 'claude-sonnet-5-5',
      schluessel: SCHLUESSEL,
    });

    await expect(versuch).rejects.toBeInstanceOf(BadRequestException);
    await expect(versuch).rejects.toThrow('API-Schlüssel abgelehnt');
    await versuch.catch((fehler: Error) =>
      expect(fehler.message).not.toContain('GEHEIM'),
    );
    expect(await dataSource.getRepository(KiEinstellungEntity).count()).toBe(0);
  });

  it('behält den gespeicherten Schlüssel, wenn nur das Modell wechselt', async () => {
    await einrichten();
    antworten.push(json(200, { id: 'claude-haiku-5-5' }));

    await dienst.einrichten(leute.inhaber, {
      anbieter: 'anthropic',
      modell: 'claude-haiku-5-5',
      schluessel: '',
    });

    expect(anfragen[1].url).toContain('claude-haiku-5-5');
    expect(anfragen[1].headers['x-api-key']).toBe(SCHLUESSEL);
  });

  it('lässt nur einrichten, wer KI-Vorschläge verwaltet', async () => {
    await expect(
      resolver.kiEinrichten(leute.aussendienst, {
        anbieter: 'anthropic',
        modell: 'claude-sonnet-5-5',
        schluessel: SCHLUESSEL,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(resolver.kiEntfernen(leute.ohneKi)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(anfragen).toHaveLength(0);
  });
});

describe('chat', () => {
  it('liest über die Werkzeuge mit den Rechten der fragenden Person', async () => {
    await einrichten();
    await geschaeft('Dachsanierung Nord', leute.inhaber.userId);
    antworten.push(
      claudeWerkzeug('search_records', { query: 'Dachsanierung' }),
      claudeText('Es gibt ein Geschäft: Dachsanierung Nord.'),
    );

    const ergebnis = await fragen(leute.inhaber, 'Welche Dachsanierungen?');

    expect(ergebnis).toMatchObject({
      antwort: 'Es gibt ein Geschäft: Dachsanierung Nord.',
      vorschlaege: [],
      schritte: [{ werkzeug: 'search_records', titel: 'Suchen', ok: true }],
      gekuerzt: false,
    });

    const zweite = rumpf(2);
    const verlauf = zweite.messages as {
      role: string;
      content: unknown;
    }[];

    expect(verlauf[1]).toMatchObject({
      role: 'assistant',
      content: [
        { type: 'thinking', signature: 'sig-1' },
        { type: 'tool_use', id: 'toolu_1' },
      ],
    });
    expect(JSON.stringify(verlauf[2])).toContain('Dachsanierung Nord');
    expect(verlauf[2]).toMatchObject({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1' }],
    });

    for (const gesendet of anfragen.slice(1)) {
      expect(gesendet.rumpf).not.toContain('GEHEIM');
      expect(gesendet.headers['x-api-key']).toBe(SCHLUESSEL);
    }

    expect(JSON.stringify(ergebnis)).not.toContain('GEHEIM');
  });

  it('zeigt einer eingeschränkten Rolle nur ihre eigenen Geschäfte', async () => {
    await einrichten();
    await geschaeft('Dachsanierung Nord', leute.inhaber.userId);
    await geschaeft('Dachsanierung Süd', leute.aussendienst.userId);
    antworten.push(
      claudeWerkzeug('search_records', { query: 'Dachsanierung' }),
      claudeText('Eins.'),
    );

    await fragen(leute.aussendienst, 'Welche Dachsanierungen?');

    const ergebnisse = JSON.stringify((rumpf(2).messages as unknown[])[2]);

    expect(ergebnisse).toContain('Dachsanierung Süd');
    expect(ergebnisse).not.toContain('Dachsanierung Nord');
  });

  it('legt Änderungen nur als Vorschlag ab und schreibt nichts', async () => {
    await einrichten();

    const deal = await geschaeft('Dachsanierung Nord', leute.inhaber.userId);

    antworten.push(
      claudeWerkzeug('update_deal', { id: deal.id, stage: 'won' }),
      claudeText(
        'Ich habe vorgeschlagen, das Geschäft auf gewonnen zu setzen.',
      ),
    );

    const ergebnis = await fragen(leute.inhaber, 'Setz es auf gewonnen.');

    expect(ergebnis.vorschlaege).toHaveLength(1);
    expect(ergebnis.schritte).toEqual([]);

    const vorschlag = await dataSource
      .getRepository(KiVorschlagEntity)
      .findOneByOrFail({ id: ergebnis.vorschlaege[0].id });

    expect(vorschlag).toMatchObject({
      status: 'offen',
      werkzeug: 'update_deal',
      apiKeyId: null,
      schluesselName: 'KI-Chat (inhaber Test)',
      workspaceId: bereich,
      dealId: deal.id,
    });
    expect(
      (
        await dataSource
          .getRepository(DealEntity)
          .findOneByOrFail({ id: deal.id })
      ).stage,
    ).toBe(DealStage.LEAD);
    const werkzeuge = rumpf(1).tools as { name: string; description: string }[];

    expect(
      werkzeuge.find((werkzeug) => werkzeug.name === 'update_deal')
        ?.description,
    ).toContain('KI-Vorschläge');
  });

  it('kann nichts vorschlagen, was die Person nicht sieht', async () => {
    await einrichten();

    const fremdes = await geschaeft('Fremd', leute.inhaber.userId);

    antworten.push(
      claudeWerkzeug('update_deal', { id: fremdes.id, stage: 'won' }),
      claudeText('Das ging nicht.'),
    );

    const ergebnis = await fragen(leute.aussendienst, 'Auf gewonnen.');

    expect(ergebnis.vorschlaege).toHaveLength(0);
    expect(ergebnis.schritte).toEqual([]);
    expect(await dataSource.getRepository(KiVorschlagEntity).count()).toBe(0);
  });

  it('gibt einem fremden Bereich weder Einstellung noch Daten', async () => {
    await einrichten();
    await geschaeft('Dachsanierung Nord', leute.inhaber.userId);

    expect(await resolver.kiEinstellung(leute.fremd)).toBeNull();
    await expect(fragen(leute.fremd, 'Was gibt es?')).rejects.toThrow(
      'keine KI eingerichtet',
    );
    expect(anfragen).toHaveLength(1);
  });

  it('beschränkt die Nutzung auf das KI-Recht, wenn so eingestellt', async () => {
    await einrichten(leute.inhaber, 'ki_recht');

    await expect(fragen(leute.ohneKi, 'Hallo?')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    antworten.push(claudeText('Hallo.'));
    await expect(fragen(leute.inhaber, 'Hallo?')).resolves.toMatchObject({
      antwort: 'Hallo.',
    });
  });

  it('bricht nach der Rundengrenze ab, statt endlos zu suchen', async () => {
    await einrichten();

    for (let runde = 0; runde < 8; runde += 1) {
      antworten.push(claudeWerkzeug('search_records', { query: 'x' }));
    }

    const ergebnis = await fragen(leute.inhaber, 'Alles?');

    expect(ergebnis.gekuerzt).toBe(true);
    expect(anfragen).toHaveLength(1 + 8);
  });

  it('hält die Gesamtfrist einer Frage ein und gibt der letzten Runde nur die Restzeit', async () => {
    await einrichten();

    let jetzt = Date.now();

    const langsam = jest.spyOn(Date, 'now').mockImplementation(() => jetzt);
    const zeitlimits: (number | undefined)[] = [];
    const alt = transportHaken;

    transportHaken = (gesendet) => {
      zeitlimits.push(gesendet.zeitlimitMs);
      jetzt += 40_000;
    };

    try {
      for (let runde = 0; runde < 8; runde += 1) {
        antworten.push(claudeWerkzeug('search_records', { query: 'x' }));
      }

      const ergebnis = await fragen(leute.inhaber, 'Alles?');

      expect(zeitlimits).toEqual([
        GESAMTFRIST_MS,
        GESAMTFRIST_MS - 40_000,
        GESAMTFRIST_MS - 80_000,
      ]);
      expect(ergebnis.gekuerzt).toBe(true);
      expect(ergebnis.antwort).toContain('zu lange gedauert');
    } finally {
      transportHaken = alt;
      langsam.mockRestore();
    }
  });

  it('zeigt Vorschläge noch, wenn die letzte Runde an der Frist abbricht', async () => {
    await einrichten();

    const deal = await geschaeft('Dachsanierung Nord', leute.inhaber.userId);
    let jetzt = Date.now();
    const spion = jest.spyOn(Date, 'now').mockImplementation(() => jetzt);
    const alt = transportHaken;
    let runde = 0;

    transportHaken = () => {
      runde += 1;

      if (runde === 2) {
        jetzt += GESAMTFRIST_MS;
        throw new Error('Zeitüberschreitung');
      }
    };

    try {
      antworten.push(
        claudeWerkzeug('update_deal', { id: deal.id, stage: 'won' }),
      );

      const ergebnis = await fragen(leute.inhaber, 'Auf gewonnen.');

      expect(ergebnis.gekuerzt).toBe(true);
      expect(ergebnis.vorschlaege).toHaveLength(1);
    } finally {
      transportHaken = alt;
      spion.mockRestore();
    }
  });

  it('drosselt je Person', async () => {
    await einrichten();

    for (let frage = 0; frage < 30; frage += 1) {
      antworten.push(claudeText('Ja.'));
      await fragen(leute.inhaber, 'Noch eine?');
    }

    await expect(fragen(leute.inhaber, 'Noch eine?')).rejects.toBeInstanceOf(
      HttpException,
    );
    antworten.push(claudeText('Ja.'));
    await expect(fragen(leute.aussendienst, 'Ich?')).resolves.toBeDefined();
  });

  it('meldet einen abgelehnten Schlüssel als Satz ohne Schlüssel', async () => {
    await einrichten();
    antworten.push(json(401, { error: { message: 'invalid x-api-key' } }));

    await expect(fragen(leute.inhaber, 'Hallo?')).rejects.toThrow(
      'API-Schlüssel abgelehnt',
    );
  });

  it('lehnt einen Verlauf ab, der nicht mit einer Frage endet', async () => {
    await einrichten();

    await expect(
      als(leute.inhaber, () =>
        dienst.chat(leute.inhaber, anfrage(leute.inhaber), [
          { rolle: 'user', text: 'a' },
          { rolle: 'assistant', text: 'b' },
        ]),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('entwurf', () => {
  it('liefert nur Text und bietet keine schreibenden Werkzeuge an', async () => {
    await einrichten();
    antworten.push(claudeText('Guten Tag Herr Muster,\n\nanbei …'));

    const text = await als(leute.aussendienst, () =>
      dienst.entwurf(leute.aussendienst, anfrage(leute.aussendienst), {
        art: 'mail',
        anweisung: 'Nachfassen zum Angebot',
        empfaenger: 'muster@example.org',
      }),
    );

    expect(text).toBe('Guten Tag Herr Muster,\n\nanbei …');
    expect((rumpf(1).system as { text: string }[])[0].text).toContain(
      'ohne jede Markdown-Formatierung',
    );

    const namen = (rumpf(1).tools as { name: string }[]).map((w) => w.name);

    expect(namen).toContain('get_quote');
    expect(namen).not.toContain('update_deal');
    expect(namen).not.toContain('create_mail_draft');
    expect(await dataSource.getRepository(KiVorschlagEntity).count()).toBe(0);
  });

  it('nimmt durchgerutschte Hervorhebungen aus dem Entwurf', async () => {
    await einrichten();
    antworten.push(
      claudeText('## Angebot\n\nWir bieten **Dachsanierung** an.\n- Gerüst'),
    );

    const text = await als(leute.inhaber, () =>
      dienst.entwurf(leute.inhaber, anfrage(leute.inhaber), {
        art: 'mail',
        anweisung: 'Kurz',
      }),
    );

    expect(text).toBe('Angebot\n\nWir bieten Dachsanierung an.\n- Gerüst');
  });

  it('verlangt für Angebotstexte das Angebot', async () => {
    await einrichten();

    await expect(
      als(leute.inhaber, () =>
        dienst.entwurf(leute.inhaber, anfrage(leute.inhaber), {
          art: 'angebot_einleitung',
          anweisung: '',
        }),
      ),
    ).rejects.toThrow('braucht das Angebot');
  });
});

describe('ohneMarkdown', () => {
  it('entfernt nur Fett und Überschriften', () => {
    expect(ohneMarkdown('**a** und __b__\n# T\n  ### U')).toBe('a und b\nT\nU');
    expect(ohneMarkdown('3 * 4 = 12, Fußnote*')).toBe('3 * 4 = 12, Fußnote*');
    expect(ohneMarkdown('#Hashtag')).toBe('#Hashtag');
  });
});

describe('Wachen', () => {
  it('lässt nur Menschen an die KI und prüft das Abo, außer beim Entfernen', () => {
    const wachen = (methode: keyof KiResolver) =>
      Reflect.getMetadata(
        GUARDS_METADATA,
        KiResolver.prototype[methode] as object,
      ) as unknown[] | undefined;

    expect(Reflect.getMetadata(GUARDS_METADATA, KiResolver)).toEqual([
      GqlAuthGuard,
      NurMenschWache,
    ]);
    expect(wachen('kiChat')).toContain(BillingWriteGuard);
    expect(wachen('kiEntwurf')).toContain(BillingWriteGuard);
    expect(wachen('kiEinrichten')).toContain(BillingWriteGuard);
    expect(wachen('kiNutzungSetzen')).toContain(BillingWriteGuard);
    expect(wachen('kiEntfernen') ?? []).not.toContain(BillingWriteGuard);
  });
});

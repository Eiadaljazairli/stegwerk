import { BadRequestException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity, DealStage } from '../crm/entities/deal.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import {
  CustomFieldEntity,
  CustomFieldType,
} from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
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
import {
  type Kachel,
  MAX_KACHELN,
  pruefeKachel,
  STANDARD_KACHELN,
} from './kacheln';
import { type KachelInput } from './uebersicht.dto';
import { UebersichtResolver } from './uebersicht.resolver';
import { UebersichtService } from './uebersicht.service';

const SUITE = 'e2_uebersicht';

jest.setTimeout(60_000);

let dataSource: DataSource;
let permissions: PermissionsService;
let dienst: UebersichtService;
let resolver: UebersichtResolver;
let workspaceId: string;
let inhaberin: RequestUser;
let aussendienst: RequestUser;
let aushilfe: RequestUser;
let nurFirmen: RequestUser;
let feldSchluessel: string;

const als = <T>(wer: RequestUser, tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: 'test' }, () => {
    setzeSichtfeld(() => permissions.sichtfeldFuer(wer));

    return tun();
  });

const k = (teil: Record<string, unknown>): Kachel =>
  pruefeKachel({ id: 'k', ...teil });

const rechne = (wer: RequestUser, teil: Record<string, unknown>) =>
  als(wer, () => dienst.werte(workspaceId, wer.userId, k(teil)));

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  permissions = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );
  dienst = new UebersichtService(dataSource);
  resolver = new UebersichtResolver(permissions, dienst);

  const bereiche = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await bereiche.save(bereiche.create({ name: 'Vertrieb', slug: 'e2-ue' }))
  ).id;

  const felder = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );

  feldSchluessel = (
    await felder.create(workspaceId, {
      entity: CustomFieldEntity.DEAL,
      label: 'Quelle',
      type: CustomFieldType.SELECT,
      options: ['Messe', 'Web', 'Empfehlung'],
    })
  ).key;

  const users = dataSource.getRepository(UserEntity);
  const person = (email: string, firstName: string) =>
    users.save(
      users.create({ email, passwordHash: 'x', firstName, lastName: 'Test' }),
    );
  const [anna, ben, cara, dora] = await Promise.all([
    person('anna@e2.test', 'Anna'),
    person('ben@e2.test', 'Ben'),
    person('cara@e2.test', 'Cara'),
    person('dora@e2.test', 'Dora'),
  ]);

  const roles = dataSource.getRepository(RoleEntity);
  const lesen = [
    Permission.COMPANY_VIEW,
    Permission.CONTACT_VIEW,
    Permission.DEAL_VIEW,
    Permission.TASK_VIEW,
  ];
  const [inhaber, eigene, ohneBetrag, firmen] = await roles.save([
    roles.create({
      workspaceId,
      name: 'Inhaber',
      templateKey: 'owner',
      everything: true,
      permissions: [],
      isSystem: true,
    }),
    roles.create({
      workspaceId,
      name: 'Außendienst',
      everything: false,
      permissions: lesen,
      sichtbarkeit: { company: 'alle', contact: 'alle', deal: 'eigene' },
      isSystem: false,
    }),
    roles.create({
      workspaceId,
      name: 'Aushilfe',
      everything: false,
      permissions: lesen,
      feldrechte: {
        'deal.amount': 'verborgen',
        [`custom:deal:${feldSchluessel}`]: 'verborgen',
      },
      isSystem: false,
    }),
    roles.create({
      workspaceId,
      name: 'Nur Firmen',
      everything: false,
      permissions: [Permission.COMPANY_VIEW],
      isSystem: false,
    }),
  ]);

  await dataSource.getRepository(MembershipEntity).save(
    [
      [anna, inhaber, MembershipRole.OWNER],
      [ben, eigene, MembershipRole.MEMBER],
      [cara, ohneBetrag, MembershipRole.MEMBER],
      [dora, firmen, MembershipRole.MEMBER],
    ].map(([user, rolle, art]) => ({
      userId: (user as UserEntity).id,
      workspaceId,
      role: art as MembershipRole,
      roleId: (rolle as RoleEntity).id,
    })),
  );

  const ich = (user: UserEntity): RequestUser => ({
    userId: user.id,
    workspaceId,
    email: user.email,
  });

  inhaberin = ich(anna);
  aussendienst = ich(ben);
  aushilfe = ich(cara);
  nurFirmen = ich(dora);

  const deals = dataSource.getRepository(DealEntity);

  await deals.save([
    deals.create({
      workspaceId,
      name: 'A',
      ownerId: anna.id,
      stage: DealStage.LEAD,
      amount: 1000,
      customFields: { [feldSchluessel]: 'Messe' },
    }),
    deals.create({
      workspaceId,
      name: 'B',
      ownerId: ben.id,
      stage: DealStage.PROPOSAL,
      amount: 3000,
      customFields: { [feldSchluessel]: 'Web' },
    }),
    deals.create({
      workspaceId,
      name: 'C',
      ownerId: null,
      stage: DealStage.WON,
      amount: 5000,
    }),
    deals.create({
      workspaceId,
      name: 'D',
      ownerId: anna.id,
      stage: DealStage.LOST,
      amount: 2000,
      lostReason: 'Preis zu hoch',
    }),
  ]);

  const tasks = dataSource.getRepository(TaskEntity);
  const gestern = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  await tasks.save([
    tasks.create({
      workspaceId,
      title: 'Anrufen',
      assigneeId: anna.id,
      createdById: anna.id,
      dueDate: gestern,
    }),
    tasks.create({
      workspaceId,
      title: 'Angebot',
      assigneeId: anna.id,
      createdById: anna.id,
    }),
    tasks.create({
      workspaceId,
      title: 'Erledigt',
      assigneeId: anna.id,
      createdById: anna.id,
      completedAt: new Date(),
    }),
    tasks.create({
      workspaceId,
      title: 'Bens',
      assigneeId: ben.id,
      createdById: anna.id,
    }),
  ]);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

describe('Kennzahlen', () => {
  it('zählt und summiert offene Geschäfte', async () => {
    const offen = await rechne(inhaberin, {
      typ: 'kennzahl',
      objekt: 'deal',
      mass: 'summe',
      status: 'offen',
    });

    expect(offen).toMatchObject({ anzahl: 2, wert: 4000 });

    const schnitt = await rechne(inhaberin, {
      typ: 'kennzahl',
      objekt: 'deal',
      mass: 'durchschnitt',
      status: 'alle',
    });

    expect(schnitt.wert).toBe(2750);
  });

  it('zählt für „nur eigene“ nur eigene und unzugeordnete', async () => {
    const offen = await rechne(aussendienst, {
      typ: 'kennzahl',
      objekt: 'deal',
      mass: 'summe',
      status: 'offen',
    });

    expect(offen).toMatchObject({ anzahl: 1, wert: 3000 });

    const alle = await rechne(aussendienst, {
      typ: 'kennzahl',
      objekt: 'deal',
    });

    expect(alle.anzahl).toBe(2);
  });

  it('summiert keinen verborgenen Betrag', async () => {
    const offen = await rechne(aushilfe, {
      typ: 'kennzahl',
      objekt: 'deal',
      mass: 'summe',
      status: 'offen',
    });

    expect(offen).toMatchObject({
      anzahl: 2,
      wert: null,
      betraegeVerborgen: true,
    });
  });

  it('zählt Aufgaben: meine überfälligen, meine offenen, alle', async () => {
    expect(
      (
        await rechne(inhaberin, {
          typ: 'kennzahl',
          objekt: 'task',
          status: 'ueberfaellig',
          nurMeine: true,
        })
      ).anzahl,
    ).toBe(1);
    expect(
      (
        await rechne(inhaberin, {
          typ: 'kennzahl',
          objekt: 'task',
          status: 'offen',
          nurMeine: true,
        })
      ).anzahl,
    ).toBe(2);
    expect(
      (await rechne(inhaberin, { typ: 'kennzahl', objekt: 'task' })).anzahl,
    ).toBe(4);
  });
});

describe('Balken', () => {
  it('gruppiert nach Phase mit Namen und ohne Phasen außerhalb des Status', async () => {
    const ergebnis = await rechne(inhaberin, {
      typ: 'balken',
      objekt: 'deal',
      mass: 'summe',
      gruppe: 'phase',
      status: 'offen',
    });

    expect(
      ergebnis.balken.map((b) => [b.schluessel, b.anzahl, b.wert]),
    ).toEqual([
      ['LEAD', 1, 1000],
      ['QUALIFIED', 0, 0],
      ['PROPOSAL', 1, 3000],
      ['NEGOTIATION', 0, 0],
    ]);
    expect(ergebnis.balken[0].label).toBe('Kontakt');
  });

  it('nach Verantwortlichem, Verlustgrund und Monat', async () => {
    const leute = await rechne(inhaberin, {
      typ: 'balken',
      objekt: 'deal',
      gruppe: 'verantwortlich',
    });

    expect(leute.balken.map((b) => [b.label, b.anzahl])).toEqual([
      ['Anna Test', 2],
      ['Ben Test', 1],
      ['Niemand', 1],
    ]);

    const gruende = await rechne(inhaberin, {
      typ: 'balken',
      objekt: 'deal',
      gruppe: 'verlustgrund',
    });

    expect(gruende.balken.map((b) => [b.label, b.anzahl])).toEqual([
      ['Preis zu hoch', 1],
    ]);

    const monate = await rechne(inhaberin, {
      typ: 'balken',
      objekt: 'deal',
      gruppe: 'monat',
    });

    expect(monate.balken).toHaveLength(12);
    expect(monate.balken[11].anzahl).toBe(4);
  });

  it('gruppiert nach einem eigenen Auswahlfeld, in der Reihenfolge der Möglichkeiten', async () => {
    const quelle = await rechne(inhaberin, {
      typ: 'balken',
      objekt: 'deal',
      gruppe: `feld:${feldSchluessel}`,
    });

    expect(quelle.balken.map((b) => [b.label, b.anzahl])).toEqual([
      ['Messe', 1],
      ['Web', 1],
      ['Empfehlung', 0],
      ['Ohne Angabe', 2],
    ]);
  });

  it('nicht nach einem verborgenen Feld, ohne Summen bei verborgenem Betrag', async () => {
    const quelle = await rechne(aushilfe, {
      typ: 'balken',
      objekt: 'deal',
      gruppe: `feld:${feldSchluessel}`,
    });

    expect(quelle).toMatchObject({ gesperrt: true, balken: [] });

    const phasen = await rechne(aushilfe, {
      typ: 'balken',
      objekt: 'deal',
      mass: 'summe',
      gruppe: 'phase',
    });

    expect(phasen.betraegeVerborgen).toBe(true);
    expect(phasen.balken.every((b) => b.wert === null)).toBe(true);
    expect(phasen.balken.reduce((s, b) => s + b.anzahl, 0)).toBe(4);
  });

  it('zählt im Balken nur, was die Zeilenrechte zeigen', async () => {
    const leute = await rechne(aussendienst, {
      typ: 'balken',
      objekt: 'deal',
      gruppe: 'verantwortlich',
    });

    expect(leute.balken.map((b) => b.label).sort()).toEqual([
      'Ben Test',
      'Niemand',
    ]);
  });

  it('lehnt ein unbekanntes Feld ab', async () => {
    await expect(
      rechne(inhaberin, {
        typ: 'balken',
        objekt: 'deal',
        gruppe: 'feld:gibtesnicht',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Branche, Herkunft und Zeitraster', () => {
  let nurEigeneFirmen: RequestUser;

  beforeAll(async () => {
    const firmen = dataSource.getRepository(CompanyEntity);
    const [bau, handel] = await firmen.save([
      firmen.create({
        workspaceId,
        name: 'Bau AG',
        industry: 'Bau',
        ownerId: inhaberin.userId,
      }),
      firmen.create({
        workspaceId,
        name: 'Handel KG',
        industry: 'Handel',
        ownerId: aussendienst.userId,
      }),
    ]);
    const deals = dataSource.getRepository(DealEntity);

    await deals.update({ workspaceId, name: 'A' }, { companyId: bau.id });
    await deals.update(
      { workspaceId, name: 'B' },
      { companyId: handel.id, herkunft: 'webformular' },
    );
    await deals.update({ workspaceId, name: 'C' }, { herkunft: 'import' });

    const users = dataSource.getRepository(UserEntity);
    const emil = await users.save(
      users.create({
        email: 'emil@e2.test',
        passwordHash: 'x',
        firstName: 'Emil',
        lastName: 'Test',
      }),
    );
    const rolle = await dataSource.getRepository(RoleEntity).save({
      workspaceId,
      name: 'Eigene Firmen',
      everything: false,
      permissions: [Permission.COMPANY_VIEW, Permission.DEAL_VIEW],
      sichtbarkeit: { company: 'eigene', contact: 'alle', deal: 'alle' },
      isSystem: false,
    });

    await dataSource.getRepository(MembershipEntity).save({
      userId: emil.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: rolle.id,
    });
    nurEigeneFirmen = { userId: emil.id, workspaceId, email: emil.email };
  });

  it('gruppiert Geschäfte nach der Branche ihrer Firma', async () => {
    const ergebnis = await rechne(inhaberin, {
      typ: 'balken',
      objekt: 'deal',
      mass: 'summe',
      gruppe: 'branche',
    });

    expect(
      ergebnis.balken
        .map((b) => [b.label, b.anzahl, b.wert])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ['Bau', 1, 1000],
      ['Handel', 1, 3000],
      ['Ohne Branche', 2, 7000],
    ]);
  });

  it('verrät keine Branche einer Firma, die die Rolle nicht sieht', async () => {
    const ergebnis = await rechne(nurEigeneFirmen, {
      typ: 'balken',
      objekt: 'deal',
      gruppe: 'branche',
    });

    expect(ergebnis.balken.map((b) => [b.label, b.anzahl])).toEqual([
      ['Ohne Branche', 4],
    ]);
  });

  it('gruppiert nach Herkunft, ältere als „Unbekannt“', async () => {
    const ergebnis = await rechne(inhaberin, {
      typ: 'balken',
      objekt: 'deal',
      gruppe: 'herkunft',
    });

    expect(
      ergebnis.balken
        .map((b) => [b.schluessel, b.label, b.anzahl])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ['', 'Unbekannt', 2],
      ['import', 'Import', 1],
      ['webformular', 'Webformular', 1],
    ]);
  });

  it('nach Woche, Quartal und Jahr mit leeren Abschnitten', async () => {
    const woche = await rechne(inhaberin, {
      typ: 'balken',
      objekt: 'deal',
      gruppe: 'woche',
    });
    const quartal = await rechne(inhaberin, {
      typ: 'balken',
      objekt: 'deal',
      gruppe: 'quartal',
    });
    const jahr = await rechne(inhaberin, {
      typ: 'balken',
      objekt: 'deal',
      gruppe: 'jahr',
      zeitraum: 'jahr',
    });

    expect(woche.balken).toHaveLength(12);
    expect(woche.balken[11].anzahl).toBe(4);
    expect(woche.balken[11].label).toMatch(/^KW \d+ ’\d\d$/u);
    expect(quartal.balken).toHaveLength(8);
    expect(quartal.balken[7].schluessel).toMatch(/^\d{4}-Q[1-4]$/u);
    expect(quartal.balken[7].anzahl).toBe(4);
    expect(jahr.balken).toHaveLength(1);
    expect(jahr.balken[0]).toMatchObject({
      schluessel: String(new Date().getFullYear()),
      anzahl: 4,
    });
  });

  it('zählt nach dem Tag in Berlin, nicht in UTC', async () => {
    const jahr = new Date().getFullYear();
    const kontakte = dataSource.getRepository(ContactEntity);
    const [neujahr, silvester] = await kontakte.save([
      kontakte.create({ workspaceId, firstName: 'Neu', lastName: 'Jahr' }),
      kontakte.create({ workspaceId, firstName: 'Alt', lastName: 'Jahr' }),
    ]);

    await kontakte.update(neujahr.id, {
      createdAt: new Date(`${String(jahr - 1)}-12-31T23:30:00Z`),
    });
    await kontakte.update(silvester.id, {
      createdAt: new Date(`${String(jahr - 1)}-12-31T22:30:00Z`),
    });

    try {
      const nachJahr = await rechne(inhaberin, {
        typ: 'balken',
        objekt: 'contact',
        gruppe: 'jahr',
      });
      const dieses = await rechne(inhaberin, {
        typ: 'kennzahl',
        objekt: 'contact',
        zeitraum: 'jahr',
      });

      expect(
        nachJahr.balken
          .filter((b) => b.anzahl > 0)
          .map((b) => [b.schluessel, b.anzahl]),
      ).toEqual([
        [String(jahr - 1), 1],
        [String(jahr), 1],
      ]);
      expect(dieses.anzahl).toBe(1);
    } finally {
      await kontakte.delete([neujahr.id, silvester.id]);
    }
  });

  it('nimmt keine Branche für Aufgaben an', () => {
    expect(() =>
      k({ typ: 'balken', objekt: 'task', gruppe: 'branche' }),
    ).toThrow(BadRequestException);
  });
});

describe('Listen', () => {
  it('zeigt neue Geschäfte, ohne Betrag für die Aushilfe', async () => {
    const voll = await rechne(inhaberin, {
      typ: 'liste',
      liste: 'neueGeschaefte',
    });

    expect(voll.eintraege).toHaveLength(4);
    expect(voll.eintraege.some((e) => (e.zusatz ?? '').includes('€'))).toBe(
      true,
    );

    const ohne = await rechne(aushilfe, {
      typ: 'liste',
      liste: 'neueGeschaefte',
    });

    expect(ohne.eintraege.every((e) => e.zusatz === null)).toBe(true);

    const eigene = await rechne(aussendienst, {
      typ: 'liste',
      liste: 'neueGeschaefte',
    });

    expect(eigene.eintraege.map((e) => e.titel).sort()).toEqual(['B', 'C']);
  });

  it('kennt ruhende und gewonnene', async () => {
    expect(
      (await rechne(inhaberin, { typ: 'liste', liste: 'ruhend' })).eintraege,
    ).toEqual([]);
    expect(
      (
        await rechne(inhaberin, { typ: 'liste', liste: 'gewonnen' })
      ).eintraege.map((e) => e.link),
    ).toHaveLength(1);
  });
});

describe('Leserecht', () => {
  const eingabe = (teil: Partial<KachelInput>): KachelInput =>
    ({ id: 'k', typ: 'kennzahl', ...teil }) as KachelInput;

  it('sperrt eine Kachel ohne Leserecht, statt sie zu verweigern', async () => {
    const geschaefte = await als(nurFirmen, () =>
      resolver.kachelWerte(nurFirmen, eingabe({ objekt: 'deal' })),
    );

    expect(geschaefte).toMatchObject({ gesperrt: true, anzahl: null });

    const liste = await als(nurFirmen, () =>
      resolver.kachelWerte(
        nurFirmen,
        eingabe({ typ: 'liste', liste: 'neueKontakte' }),
      ),
    );

    expect(liste.gesperrt).toBe(true);

    const firmen = await als(nurFirmen, () =>
      resolver.kachelWerte(nurFirmen, eingabe({ objekt: 'company' })),
    );

    expect(firmen).toMatchObject({ gesperrt: false, anzahl: 2 });
  });
});

describe('Speichern', () => {
  it('ohne Eintrag der Standard, gespeichert je Person', async () => {
    expect(await dienst.laden(inhaberin.userId, workspaceId)).toEqual(
      STANDARD_KACHELN,
    );

    const gespeichert = await dienst.speichern(inhaberin.userId, workspaceId, [
      { id: 'a', typ: 'prognose' },
      { id: 'b', typ: 'balken', objekt: 'deal', gruppe: 'phase', titel: ' X ' },
    ]);

    expect(gespeichert.map((kachel) => kachel.titel)).toEqual([null, 'X']);
    expect(await dienst.laden(inhaberin.userId, workspaceId)).toEqual(
      gespeichert,
    );
    expect(await dienst.laden(aushilfe.userId, workspaceId)).toEqual(
      STANDARD_KACHELN,
    );

    expect(await dienst.zuruecksetzen(inhaberin.userId, workspaceId)).toEqual(
      STANDARD_KACHELN,
    );
    expect(await dienst.laden(inhaberin.userId, workspaceId)).toEqual(
      STANDARD_KACHELN,
    );
  });

  it('nimmt nur, was die feste Liste kennt', async () => {
    const falsch: Record<string, unknown>[] = [
      { id: 'a', typ: 'sql' },
      { id: 'a', typ: 'kennzahl', objekt: 'quote' },
      { id: 'a', typ: 'kennzahl', objekt: 'company', mass: 'summe' },
      { id: 'a', typ: 'balken', objekt: 'company', gruppe: 'phase' },
      {
        id: 'a',
        typ: 'balken',
        objekt: 'deal',
        gruppe: 'feld:x; DROP TABLE deals',
      },
      { id: 'a', typ: 'kennzahl', objekt: 'deal', status: 'irgendwas' },
      { id: 'a', typ: 'kennzahl', objekt: 'deal', pipelineId: "1' OR '1'='1" },
      { id: 'a b', typ: 'prognose' },
      { id: 'a', typ: 'liste', liste: 'rechnungen' },
    ];

    for (const kachel of falsch) {
      await expect(
        dienst.speichern(inhaberin.userId, workspaceId, [kachel]),
      ).rejects.toBeInstanceOf(BadRequestException);
    }

    await expect(
      dienst.speichern(inhaberin.userId, workspaceId, [
        { id: 'a', typ: 'prognose' },
        { id: 'a', typ: 'pipeline' },
      ]),
    ).rejects.toThrow('dieselbe Kennung');
  });

  it(`hält die Grenze von ${String(MAX_KACHELN)} Kacheln`, async () => {
    const viele = Array.from({ length: MAX_KACHELN + 1 }, (_, i) => ({
      id: `k${String(i)}`,
      typ: 'prognose',
    }));

    await expect(
      dienst.speichern(inhaberin.userId, workspaceId, viele),
    ).rejects.toThrow('Höchstens');
    await expect(
      dienst.speichern(inhaberin.userId, workspaceId, viele.slice(1)),
    ).resolves.toHaveLength(MAX_KACHELN);
  });
});

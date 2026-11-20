import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { CompaniesService } from '../crm/companies.service';
import { CompanyEntity } from '../crm/entities/company.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { ROLE_TEMPLATES } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { WorkspaceRolesService } from '../workspaces/workspace-roles.service';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { CustomFieldGroupEntity } from './custom-field-group.entity';
import { CustomFieldDefinition } from './custom-field.entity';
import { CustomFieldEntity, CustomFieldType } from './custom-field.types';
import { CustomFieldsResolver } from './custom-fields.resolver';
import {
  CustomFieldsService,
  standardwerteLesen,
} from './custom-fields.service';

const SUITE = 'feld_zusatz';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: CustomFieldsService;
let companies: CompaniesService;
let resolver: CustomFieldsResolver;
let workspaceId: string;
let fremderId: string;
const leute = {} as Record<'inhaber' | 'lesen' | 'fremd', RequestUser>;

const COMPANY = CustomFieldEntity.COMPANY;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );
  companies = new CompaniesService(
    dataSource.getRepository(CompanyEntity),
    service,
  );

  const m = dataSource.manager;

  workspaceId = (
    await m.save(m.create(WorkspaceEntity, { name: 'Unsere', slug: 'unsere' }))
  ).id;
  fremderId = (
    await m.save(m.create(WorkspaceEntity, { name: 'Fremde', slug: 'fremde' }))
  ).id;

  const person = async (
    kurz: keyof typeof leute,
    bereich: string,
    vorlage: string,
    rolle: MembershipRole,
  ) => {
    const tpl = ROLE_TEMPLATES.find((t) => t.key === vorlage);

    if (tpl === undefined) {
      throw new Error(`Keine Vorlage ${vorlage}`);
    }

    const role = await m.save(
      m.create(RoleEntity, {
        workspaceId: bereich,
        name: `${tpl.name} ${kurz}`,
        templateKey: tpl.key,
        everything: tpl.everything,
        permissions: [...tpl.permissions],
        isSystem: true,
      }),
    );
    const user = await m.save(
      m.create(UserEntity, {
        email: `${kurz}@feld.example`,
        passwordHash: 'x',
        firstName: kurz,
        lastName: 'Test',
      }),
    );

    await m.save(
      m.create(MembershipEntity, {
        userId: user.id,
        workspaceId: bereich,
        role: rolle,
        roleId: role.id,
      }),
    );
    leute[kurz] = { userId: user.id, workspaceId: bereich, email: user.email };
  };

  await person('inhaber', workspaceId, 'owner', MembershipRole.OWNER);
  await person('lesen', workspaceId, 'readonly', MembershipRole.MEMBER);
  await person('fremd', fremderId, 'owner', MembershipRole.OWNER);

  const permissions = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );

  resolver = new CustomFieldsResolver(
    service,
    new WorkspaceRolesService(permissions),
    permissions,
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE companies, custom_fields, custom_field_groups CASCADE',
  );
});

const define = (
  label: string,
  type = CustomFieldType.TEXT,
  extra: Record<string, unknown> = {},
) => service.create(workspaceId, { entity: COMPANY, label, type, ...extra });

describe('Hinweis am Feld', () => {
  it('wird getrimmt, und leer heißt kein Hinweis', async () => {
    const feld = await define('Kundennummer', CustomFieldType.TEXT, {
      beschreibung: '  Aus DATEV übernehmen  ',
    });

    expect(feld.beschreibung).toBe('Aus DATEV übernehmen');

    const ohne = await service.update(workspaceId, feld.id, {
      beschreibung: '   ',
    });

    expect(ohne.beschreibung).toBeNull();
  });

  it('bleibt, wenn eine Änderung ihn nicht nennt', async () => {
    const feld = await define('Region', CustomFieldType.TEXT, {
      beschreibung: 'Vertriebsgebiet',
    });

    const umbenannt = await service.update(workspaceId, feld.id, {
      label: 'Gebiet',
    });

    expect(umbenannt.beschreibung).toBe('Vertriebsgebiet');
  });
});

describe('Standardwert', () => {
  it('wird geprüft wie ein Wert und in dessen Form gespeichert', async () => {
    const zahl = await define('Mitarbeiter', CustomFieldType.NUMBER, {
      standardwert: '1.500,5',
    });
    const janein = await define('Newsletter', CustomFieldType.BOOLEAN, {
      standardwert: 'nein',
    });

    expect(zahl.standardwertWert).toBe(1500.5);
    expect(zahl.standardwert).toBe('1500.5');
    expect(janein.standardwertWert).toBe(false);
    expect(janein.standardwert).toBe('false');
  });

  it('muss bei einer Auswahl unter den Möglichkeiten stehen', async () => {
    await expect(
      define('Status', CustomFieldType.SELECT, {
        options: ['Interessent', 'Kunde'],
        standardwert: 'Partner',
      }),
    ).rejects.toThrow(BadRequestException);

    const feld = await define('Status', CustomFieldType.SELECT, {
      options: ['Interessent', 'Kunde'],
      standardwert: 'Interessent',
    });

    expect(feld.standardwertWert).toBe('Interessent');
  });

  it('ordnet eine Mehrfachauswahl wie die Möglichkeiten und gibt sie als Text', async () => {
    const feld = await define('Interessen', CustomFieldType.MULTI_SELECT, {
      options: ['A', 'B', 'C'],
      standardwert: 'C;A',
    });

    expect(feld.standardwertWert).toEqual(['A', 'C']);
    expect(feld.standardwert).toBe('A;C');
  });

  it('gibt es nicht bei eindeutigen Feldern und nicht bei Anschriften', async () => {
    await expect(
      define('Kundennr', CustomFieldType.TEXT, {
        eindeutig: true,
        standardwert: 'K-1',
      }),
    ).rejects.toThrow(/eindeutig/);
    await expect(
      define('Lieferadresse', CustomFieldType.ADDRESS, { standardwert: 'x' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('lässt ein Feld nicht eindeutig werden, solange es einen hat', async () => {
    const feld = await define('Code', CustomFieldType.TEXT, {
      standardwert: 'X',
    });

    await expect(
      service.update(workspaceId, feld.id, { eindeutig: true }),
    ).rejects.toThrow(/Standardwert/);

    const eindeutig = await service.update(workspaceId, feld.id, {
      eindeutig: true,
      standardwert: null,
    });

    expect(eindeutig.eindeutig).toBe(true);
    expect(eindeutig.standardwertWert).toBeNull();
  });

  it('wird mit leer zurückgenommen', async () => {
    const feld = await define('Quelle', CustomFieldType.TEXT, {
      standardwert: 'Messe',
    });

    expect(
      (await service.update(workspaceId, feld.id, { standardwert: '' }))
        .standardwertWert,
    ).toBeNull();
  });
});

describe('Standardwert beim Anlegen', () => {
  it('füllt fehlende Felder eines neuen Datensatzes', async () => {
    await define('Status', CustomFieldType.SELECT, {
      options: ['Interessent', 'Kunde'],
      standardwert: 'Interessent',
    });
    await define('Newsletter', CustomFieldType.BOOLEAN, {
      standardwert: 'false',
    });

    const firma = await companies.create(workspaceId, { name: 'Neu GmbH' });

    expect(firma.customFields).toEqual({
      status: 'Interessent',
      newsletter: false,
    });
  });

  it('lässt mitgeschickte Werte vorgehen, auch ein ausdrückliches Leer', async () => {
    await define('Status', CustomFieldType.SELECT, {
      options: ['Interessent', 'Kunde'],
      standardwert: 'Interessent',
    });
    await define('Quelle', CustomFieldType.TEXT, { standardwert: 'Messe' });

    const firma = await companies.create(workspaceId, {
      name: 'Gezielt GmbH',
      customFields: { status: 'Kunde', quelle: null },
    });

    expect(firma.customFields).toEqual({ status: 'Kunde' });
  });

  it('erfüllt ein Pflichtfeld, das sonst das Anlegen verhinderte', async () => {
    await define('Region', CustomFieldType.TEXT, {
      required: true,
      standardwert: 'Nord',
    });

    const firma = await companies.create(workspaceId, { name: 'Pflicht AG' });

    expect(firma.customFields).toEqual({ region: 'Nord' });
  });

  it('ändert vorhandene Datensätze nicht', async () => {
    const alt = await companies.create(workspaceId, { name: 'Alt KG' });

    await define('Quelle', CustomFieldType.TEXT, { standardwert: 'Messe' });

    const geaendert = await companies.update(workspaceId, alt.id, {
      name: 'Alt KG neu',
    });

    expect(geaendert.customFields).toEqual({});
  });

  it('liefert die Standardwerte für Wege ohne Prüfung, nur aus dem eigenen Bereich', async () => {
    await define('Quelle', CustomFieldType.TEXT, {
      standardwert: 'Webformular',
    });
    await define('Archiviert', CustomFieldType.TEXT, {
      standardwert: 'weg',
    }).then((f) => service.archive(workspaceId, f.id));
    await service.create(fremderId, {
      entity: COMPANY,
      label: 'Fremd',
      type: CustomFieldType.TEXT,
      standardwert: 'fremd',
    });

    expect(
      await standardwerteLesen(dataSource.manager, workspaceId, COMPANY),
    ).toEqual({ quelle: 'Webformular' });
  });
});

describe('Abschnitte', () => {
  it('nimmt Felder auf und gibt sie beim Löschen frei', async () => {
    const vertrag = await service.createGruppe(workspaceId, {
      entity: COMPANY,
      name: ' Vertrag ',
    });
    const feld = await define('Laufzeit', CustomFieldType.DATE, {
      gruppeId: vertrag.id,
    });

    expect(vertrag.name).toBe('Vertrag');
    expect(feld.gruppeId).toBe(vertrag.id);

    await service.deleteGruppe(workspaceId, vertrag.id);

    const [danach] = await service.list(workspaceId, COMPANY);

    expect(danach.gruppeId).toBeNull();
    expect(await service.listGruppen(workspaceId, COMPANY)).toEqual([]);
  });

  it('weist einen zweiten Abschnitt gleichen Namens ab', async () => {
    await service.createGruppe(workspaceId, {
      entity: COMPANY,
      name: 'Technik',
    });

    await expect(
      service.createGruppe(workspaceId, { entity: COMPANY, name: 'technik' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createGruppe(workspaceId, {
        entity: CustomFieldEntity.DEAL,
        name: 'Technik',
      }),
    ).resolves.toBeDefined();
  });

  it('nimmt keinen Abschnitt einer anderen Art von Datensatz', async () => {
    const amGeschaeft = await service.createGruppe(workspaceId, {
      entity: CustomFieldEntity.DEAL,
      name: 'Angebot',
    });

    await expect(
      define('Laufzeit', CustomFieldType.DATE, { gruppeId: amGeschaeft.id }),
    ).rejects.toThrow(BadRequestException);
  });

  it('kennt keine Abschnitte eines fremden Bereichs', async () => {
    const fremd = await service.createGruppe(fremderId, {
      entity: COMPANY,
      name: 'Fremd',
    });

    await expect(
      define('Laufzeit', CustomFieldType.DATE, { gruppeId: fremd.id }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.updateGruppe(workspaceId, { id: fremd.id, name: 'Meins' }),
    ).rejects.toThrow(NotFoundException);
    await expect(service.deleteGruppe(workspaceId, fremd.id)).rejects.toThrow(
      NotFoundException,
    );
    expect(await service.listGruppen(workspaceId)).toEqual([]);
  });

  it('merkt sich Reihenfolge und Einklappen', async () => {
    const a = await service.createGruppe(workspaceId, {
      entity: COMPANY,
      name: 'A',
    });
    const b = await service.createGruppe(workspaceId, {
      entity: COMPANY,
      name: 'B',
      eingeklappt: true,
    });

    expect([a.position, b.position]).toEqual([0, 1]);
    expect(b.eingeklappt).toBe(true);

    await service.updateGruppe(workspaceId, { id: a.id, position: 5 });

    expect(
      (await service.listGruppen(workspaceId, COMPANY)).map((g) => g.name),
    ).toEqual(['B', 'A']);
  });
});

describe('Füllgrad', () => {
  it('zählt je Feld die gefüllten Datensätze, ohne Papierkorb und fremde', async () => {
    await define('Region');
    await define('Kaum');
    await companies.create(workspaceId, {
      name: 'Eins',
      customFields: { region: 'Nord' },
    });
    await companies.create(workspaceId, {
      name: 'Zwei',
      customFields: { region: 'Süd', kaum: 'x' },
    });
    const weg = await companies.create(workspaceId, {
      name: 'Weg',
      customFields: { kaum: 'y' },
    });

    await dataSource.query(
      `UPDATE companies SET "deletedAt" = now() WHERE id = $1`,
      [weg.id],
    );
    await dataSource.query(
      `INSERT INTO companies ("workspaceId", name, "customFields")
       VALUES ($1, 'Fremd', '{"region":"Ost"}'::jsonb)`,
      [fremderId],
    );

    expect(await service.fuellgrad(workspaceId, COMPANY)).toEqual([
      { key: 'region', gefuellt: 2, gesamt: 2 },
      { key: 'kaum', gefuellt: 1, gesamt: 2 },
    ]);
  });
});

describe('Rechte', () => {
  it('lässt den Inhaber Abschnitte anlegen und ändern', async () => {
    const gruppe = await resolver.createCustomFieldGroup(leute.inhaber, {
      entity: COMPANY,
      name: 'Abrechnung',
    });

    await expect(
      resolver.updateCustomFieldGroup(leute.inhaber, {
        id: gruppe.id,
        eingeklappt: true,
      }),
    ).resolves.toMatchObject({ eingeklappt: true });
    await expect(
      resolver.feldFuellgrad(leute.inhaber, COMPANY),
    ).resolves.toEqual([]);
  });

  it('weist eine Rolle ohne Feldverwaltung ab, lässt sie aber lesen', async () => {
    const gruppe = await service.createGruppe(workspaceId, {
      entity: COMPANY,
      name: 'Technik',
    });

    await expect(
      resolver.createCustomFieldGroup(leute.lesen, {
        entity: COMPANY,
        name: 'Heimlich',
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      resolver.updateCustomFieldGroup(leute.lesen, {
        id: gruppe.id,
        name: 'Umbenannt',
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      resolver.deleteCustomFieldGroup(leute.lesen, gruppe.id),
    ).rejects.toThrow(ForbiddenException);
    await expect(resolver.feldFuellgrad(leute.lesen, COMPANY)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      resolver.customFieldGroups(leute.lesen, COMPANY),
    ).resolves.toHaveLength(1);
  });

  it('lässt einen fremden Bereich weder sehen noch ändern', async () => {
    const gruppe = await service.createGruppe(workspaceId, {
      entity: COMPANY,
      name: 'Vertrag',
    });

    await expect(resolver.customFieldGroups(leute.fremd)).resolves.toEqual([]);
    await expect(
      resolver.updateCustomFieldGroup(leute.fremd, {
        id: gruppe.id,
        name: 'Gekapert',
      }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      resolver.deleteCustomFieldGroup(leute.fremd, gruppe.id),
    ).rejects.toThrow(NotFoundException);
    expect(
      (
        await dataSource.getRepository(CustomFieldGroupEntity).findOneByOrFail({
          id: gruppe.id,
        })
      ).name,
    ).toBe('Vertrag');
  });
});

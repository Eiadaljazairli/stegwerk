import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { CompaniesService } from '../crm/companies.service';
import { ContactsService } from '../crm/contacts.service';
import { DealsService } from '../crm/deals.service';
import { DublettenService } from '../crm/dubletten.service';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { ExportService } from '../export/export.service';
import { ImportEntity } from '../import/dto/import.dto';
import { ImportService } from '../import/import.service';
import { runWithRequestContext } from '../observability/request-context';
import { PapierkorbArt } from '../papierkorb/papierkorb.dto';
import { PapierkorbService } from '../papierkorb/papierkorb.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { type Feldrechte } from '../workspaces/feldrechte';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { type Permission, ROLE_TEMPLATES } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import {
  ALLES_SICHTBAR,
  type Sichtbarkeit,
  setzeSichtfeld,
} from '../workspaces/sichtbarkeit';
import { WorkspaceRolesService } from '../workspaces/workspace-roles.service';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { CustomFieldDefinition } from './custom-field.entity';
import {
  CustomFieldEntity,
  CustomFieldFilterOperator,
  CustomFieldType,
} from './custom-field.types';
import { CustomFieldsResolver } from './custom-fields.resolver';
import { CustomFieldsService } from './custom-fields.service';
import { gegenfeldLesen, MAX_GEGENFELD_EINTRAEGE } from './verknuepfung';

const SUITE = 'verknuepfung';

jest.setTimeout(90_000);

let dataSource: DataSource;
let felder: CustomFieldsService;
let firmen: CompaniesService;
let kontakte: ContactsService;
let geschaefte: DealsService;
let permissions: PermissionsService;
let resolver: CustomFieldsResolver;
let workspaceId: string;
let fremderId: string;

type Wer = 'inhaber' | 'eigene' | 'ohneGeschaefte' | 'feldVerborgen' | 'fremd';
const leute = {} as Record<Wer, RequestUser>;

const COMPANY = CustomFieldEntity.COMPANY;
const CONTACT = CustomFieldEntity.CONTACT;
const DEAL = CustomFieldEntity.DEAL;

const als = <T>(wer: Wer, tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: `test-${wer}` }, () => {
    setzeSichtfeld(() => permissions.sichtfeldFuer(leute[wer]));

    return tun();
  });

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  felder = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );
  firmen = new CompaniesService(
    dataSource.getRepository(CompanyEntity),
    felder,
  );
  kontakte = new ContactsService(
    dataSource.getRepository(ContactEntity),
    felder,
  );
  geschaefte = new DealsService(dataSource.getRepository(DealEntity), felder);
  permissions = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );
  resolver = new CustomFieldsResolver(
    felder,
    new WorkspaceRolesService(permissions),
    permissions,
  );

  const m = dataSource.manager;

  workspaceId = (
    await m.save(m.create(WorkspaceEntity, { name: 'Wir', slug: 'wir' }))
  ).id;
  fremderId = (
    await m.save(m.create(WorkspaceEntity, { name: 'Andere', slug: 'andere' }))
  ).id;

  const person = async (
    kurz: Wer,
    bereich: string,
    rolle: {
      vorlage: string;
      permissions?: Permission[];
      sichtbarkeit?: Sichtbarkeit;
      feldrechte?: Feldrechte;
    },
  ) => {
    const tpl = ROLE_TEMPLATES.find((t) => t.key === rolle.vorlage);

    if (tpl === undefined) {
      throw new Error(`Keine Vorlage ${rolle.vorlage}`);
    }

    const role = await m.save(
      m.create(RoleEntity, {
        workspaceId: bereich,
        name: `Rolle ${kurz}`,
        templateKey: rolle.permissions === undefined ? tpl.key : null,
        everything: tpl.everything,
        permissions: rolle.permissions ?? [...tpl.permissions],
        isSystem: false,
        sichtbarkeit: rolle.sichtbarkeit ?? ALLES_SICHTBAR,
        feldrechte: rolle.feldrechte ?? {},
      }),
    );
    const user = await m.save(
      m.create(UserEntity, {
        email: `${kurz}@verknuepfung.example`,
        passwordHash: 'x',
        firstName: kurz,
        lastName: 'Test',
      }),
    );

    await m.save(
      m.create(MembershipEntity, {
        userId: user.id,
        workspaceId: bereich,
        role:
          rolle.vorlage === 'owner'
            ? MembershipRole.OWNER
            : MembershipRole.MEMBER,
        roleId: role.id,
      }),
    );
    leute[kurz] = { userId: user.id, workspaceId: bereich, email: user.email };
  };

  await person('inhaber', workspaceId, { vorlage: 'owner' });
  await person('eigene', workspaceId, {
    vorlage: 'member',
    sichtbarkeit: { company: 'eigene', contact: 'alle', deal: 'alle' },
  });
  await person('ohneGeschaefte', workspaceId, {
    vorlage: 'member',
    permissions: (
      ROLE_TEMPLATES.find((t) => t.key === 'member')?.permissions ?? []
    ).filter((p) => !p.startsWith('deal:')),
  });
  await person('feldVerborgen', workspaceId, {
    vorlage: 'member',
    feldrechte: { 'custom:contact:partnerfirma': 'verborgen' },
  });
  await person('fremd', fremderId, { vorlage: 'owner' });
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE companies, contacts, deals, custom_fields CASCADE',
  );
});

const partnerfirma = () =>
  felder.create(workspaceId, {
    entity: CONTACT,
    label: 'Partnerfirma',
    type: CustomFieldType.RELATION,
    zielEntity: COMPANY,
  });

const beteiligteFirmen = () =>
  felder.create(workspaceId, {
    entity: DEAL,
    label: 'Beteiligte Firmen',
    type: CustomFieldType.RELATION,
    zielEntity: COMPANY,
    mehrere: true,
    gegenfeldLabel: 'Beteiligt an',
  });

const firma = (
  name: string,
  ownerId: string | null = null,
  bereich = workspaceId,
) => firmen.create(bereich, { name, ownerId });

describe('Anlegen', () => {
  it('legt das Gegenfeld an der Zielart an, beide zeigen aufeinander', async () => {
    const feld = await partnerfirma();
    const gegenfeld = await dataSource
      .getRepository(CustomFieldDefinition)
      .findOneByOrFail({ id: feld.gegenfeldId as string });

    expect(feld).toMatchObject({
      entity: CONTACT,
      key: 'partnerfirma',
      zielEntity: COMPANY,
      mehrere: false,
      gegenseite: false,
    });
    expect(gegenfeld).toMatchObject({
      entity: COMPANY,
      label: 'Kontakte (Partnerfirma)',
      zielEntity: CONTACT,
      mehrere: true,
      gegenseite: true,
      gegenfeldId: feld.id,
    });
  });

  it('nimmt einen genannten Namen für das Gegenfeld', async () => {
    const feld = await beteiligteFirmen();
    const gegenfeld = await dataSource
      .getRepository(CustomFieldDefinition)
      .findOneByOrFail({ id: feld.gegenfeldId as string });

    expect(gegenfeld.label).toBe('Beteiligt an');
    expect(gegenfeld.key).toBe('beteiligt_an');
  });

  it('lehnt ab, was eine Verknüpfung nicht sein kann', async () => {
    const basis = {
      entity: CONTACT,
      label: 'Partner',
      type: CustomFieldType.RELATION,
      zielEntity: COMPANY,
    };

    await expect(
      felder.create(workspaceId, { ...basis, required: true }),
    ).rejects.toThrow('kein Pflichtfeld');
    await expect(
      felder.create(workspaceId, { ...basis, eindeutig: true }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      felder.create(workspaceId, { ...basis, standardwert: 'x' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      felder.create(workspaceId, {
        ...basis,
        zielEntity: CustomFieldEntity.TASK,
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      felder.create(workspaceId, { ...basis, zielEntity: null }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      felder.create(workspaceId, { ...basis, entity: CustomFieldEntity.TASK }),
    ).rejects.toThrow(BadRequestException);

    expect(await dataSource.getRepository(CustomFieldDefinition).count()).toBe(
      0,
    );
  });

  it('braucht einen freien Namen auf beiden Seiten und rollt sonst ganz zurück', async () => {
    await felder.create(workspaceId, {
      entity: COMPANY,
      label: 'Kontakte (Partnerfirma)',
      type: CustomFieldType.TEXT,
    });

    await expect(partnerfirma()).rejects.toThrow('gibt es bei Firmen schon');
    expect(
      await dataSource
        .getRepository(CustomFieldDefinition)
        .countBy({ entity: CONTACT }),
    ).toBe(0);
  });

  it('verbindet eine Art mit sich selbst nur unter zwei Namen', async () => {
    await expect(
      felder.create(workspaceId, {
        entity: COMPANY,
        label: 'Partner',
        type: CustomFieldType.RELATION,
        zielEntity: COMPANY,
        gegenfeldLabel: 'partner',
      }),
    ).rejects.toThrow('verschiedene Namen');

    const feld = await felder.create(workspaceId, {
      entity: COMPANY,
      label: 'Partner',
      type: CustomFieldType.RELATION,
      zielEntity: COMPANY,
      mehrere: true,
    });

    expect(feld.gegenfeldId).not.toBeNull();
  });

  it('darf nur, wer Felder verwaltet; eine fremde Kennung gibt es nicht', async () => {
    await expect(
      resolver.createCustomField(leute.eigene, {
        entity: CONTACT,
        label: 'Partner',
        type: CustomFieldType.RELATION,
        zielEntity: COMPANY,
      }),
    ).rejects.toThrow(ForbiddenException);

    const feld = await resolver.createCustomField(leute.inhaber, {
      entity: CONTACT,
      label: 'Partner',
      type: CustomFieldType.RELATION,
      zielEntity: COMPANY,
    });

    await expect(
      resolver.archiveCustomField(leute.fremd, feld.id),
    ).rejects.toThrow(NotFoundException);
  });

  it('archiviert und holt das Paar gemeinsam zurück', async () => {
    const feld = await partnerfirma();
    const repo = dataSource.getRepository(CustomFieldDefinition);

    await felder.archive(workspaceId, feld.gegenfeldId as string);
    expect((await repo.findOneByOrFail({ id: feld.id })).archivedAt).not.toBe(
      null,
    );

    await felder.restore(workspaceId, feld.id);
    expect(
      (await repo.findOneByOrFail({ id: feld.gegenfeldId as string }))
        .archivedAt,
    ).toBeNull();
  });

  it('lässt Ziel und Pflicht am Gegenfeld nicht ändern', async () => {
    const feld = await partnerfirma();

    await expect(
      felder.update(workspaceId, feld.id, { required: true }),
    ).rejects.toThrow('kein Pflichtfeld');

    const umbenannt = await felder.update(
      workspaceId,
      feld.gegenfeldId as string,
      { label: 'Ansprechpartner' },
    );

    expect(umbenannt.label).toBe('Ansprechpartner');
  });
});

describe('Werte', () => {
  it('speichert eine Kennung oder eine Liste davon', async () => {
    await partnerfirma();
    await beteiligteFirmen();
    const a = await firma('Alpha');
    const b = await firma('Beta');

    const k = await kontakte.create(workspaceId, {
      firstName: 'Kai',
      lastName: 'K',
      customFields: { partnerfirma: a.id.toUpperCase() },
    });
    const g = await geschaefte.create(workspaceId, {
      name: 'Projekt',
      customFields: { beteiligte_firmen: [a.id, b.id, a.id] },
    });

    expect(k.customFields).toEqual({ partnerfirma: a.id });
    expect(g.customFields).toEqual({ beteiligte_firmen: [a.id, b.id] });

    const g2 = await geschaefte.update(workspaceId, g.id, {
      customFields: { beteiligte_firmen: `${b.id}; ` },
    });

    expect(g2.customFields).toEqual({ beteiligte_firmen: [b.id] });
  });

  it('lehnt Text, mehrere statt einem, Fremdes und Gelöschtes ab', async () => {
    await partnerfirma();
    const a = await firma('Alpha');
    const b = await firma('Beta');
    const fremd = await firma('Fremd GmbH', null, fremderId);
    const weg = await firma('Weg AG');

    await firmen.remove(workspaceId, weg.id);

    const setze = (wert: unknown) =>
      kontakte.create(workspaceId, {
        firstName: 'X',
        lastName: 'Y',
        customFields: { partnerfirma: wert as string },
      });

    await expect(setze('Alpha')).rejects.toThrow('keinen Text');
    await expect(setze([a.id, b.id])).rejects.toThrow('nur einen Datensatz');
    await expect(setze(fremd.id)).rejects.toThrow('gibt es in diesem');
    await expect(setze(weg.id)).rejects.toThrow('gibt es in diesem');
  });

  it('nimmt in das Gegenfeld nichts an', async () => {
    const feld = await partnerfirma();
    const gegenfeld = await dataSource
      .getRepository(CustomFieldDefinition)
      .findOneByOrFail({ id: feld.gegenfeldId as string });

    await expect(
      firmen.create(workspaceId, {
        name: 'Alpha',
        customFields: { [gegenfeld.key]: [] },
      }),
    ).rejects.toThrow('ergibt sich aus den Verweisen');
  });
});

describe('Zeilenrechte', () => {
  it('lässt nicht auf eine Firma zeigen, die die Rolle nicht sieht', async () => {
    await partnerfirma();
    const fremdeFirma = await firma('Fremde Firma', leute.inhaber.userId);
    const eigeneFirma = await firma('Eigene Firma', leute.eigene.userId);

    await expect(
      als('eigene', () =>
        kontakte.create(workspaceId, {
          firstName: 'E',
          lastName: 'E',
          customFields: { partnerfirma: fremdeFirma.id },
        }),
      ),
    ).rejects.toThrow('gibt es in diesem');

    const k = await als('eigene', () =>
      kontakte.create(workspaceId, {
        firstName: 'E',
        lastName: 'E',
        customFields: { partnerfirma: eigeneFirma.id },
      }),
    );

    expect(k.customFields?.partnerfirma).toBe(eigeneFirma.id);
  });

  it('behält Verweise, die die Rolle nicht sieht, und lässt sie nicht ersetzen', async () => {
    await partnerfirma();
    await beteiligteFirmen();
    const verborgen = await firma('Verborgen', leute.inhaber.userId);
    const offen = await firma('Offen', null);
    const k = await kontakte.create(workspaceId, {
      firstName: 'K',
      lastName: 'K',
      customFields: { partnerfirma: verborgen.id },
    });
    const g = await geschaefte.create(workspaceId, {
      name: 'G',
      customFields: { beteiligte_firmen: [verborgen.id] },
    });

    const neu = await als('eigene', () =>
      geschaefte.update(workspaceId, g.id, {
        customFields: { beteiligte_firmen: [offen.id] },
      }),
    );

    expect(neu.customFields?.beteiligte_firmen).toEqual([
      verborgen.id,
      offen.id,
    ]);

    await expect(
      als('eigene', () =>
        kontakte.update(workspaceId, k.id, {
          customFields: { partnerfirma: offen.id },
        }),
      ),
    ).rejects.toThrow('nicht sieht');
    await expect(
      als('eigene', () =>
        kontakte.update(workspaceId, k.id, {
          customFields: { partnerfirma: null },
        }),
      ),
    ).rejects.toThrow('nicht sieht');

    const umbenannt = await als('eigene', () =>
      kontakte.update(workspaceId, k.id, { firstName: 'Karl' }),
    );

    expect(umbenannt.customFields?.partnerfirma).toBe(verborgen.id);
  });

  it('behandelt Geschäfte ohne das Recht dafür beim Schreiben und Import als nicht sichtbar', async () => {
    const hauptgeschaeft = () =>
      felder.create(workspaceId, {
        entity: COMPANY,
        label: 'Hauptgeschäft',
        type: CustomFieldType.RELATION,
        zielEntity: DEAL,
      });

    await hauptgeschaeft();
    await felder.create(workspaceId, {
      entity: COMPANY,
      label: 'Geschäfte',
      type: CustomFieldType.RELATION,
      zielEntity: DEAL,
      mehrere: true,
      gegenfeldLabel: 'Bei Firmen',
    });
    const deal = await geschaefte.create(workspaceId, { name: 'Großauftrag' });
    const leer = await firma('Leer GmbH', null);
    const belegt = await firmen.create(workspaceId, {
      name: 'Belegt GmbH',
      customFields: { hauptgeschaeft: deal.id, geschaefte: [deal.id] },
    });

    await expect(
      als('ohneGeschaefte', () =>
        firmen.update(workspaceId, leer.id, {
          customFields: { hauptgeschaeft: deal.id },
        }),
      ),
    ).rejects.toThrow('Geschäft für "Hauptgeschäft" gibt es in diesem');

    await expect(
      als('ohneGeschaefte', () =>
        firmen.update(workspaceId, belegt.id, {
          customFields: { hauptgeschaeft: null },
        }),
      ),
    ).rejects.toThrow('nicht sieht');

    const nachher = await als('ohneGeschaefte', () =>
      firmen.update(workspaceId, belegt.id, {
        customFields: { geschaefte: [] },
      }),
    );

    expect(nachher.customFields?.geschaefte).toEqual([deal.id]);
    expect(nachher.customFields?.hauptgeschaeft).toBe(deal.id);

    await geschaefte.create(workspaceId, { name: 'Doppelt' });
    await geschaefte.create(workspaceId, { name: 'Doppelt' });

    const bericht = await als('ohneGeschaefte', () =>
      new ImportService(dataSource, felder).run(workspaceId, {
        entity: ImportEntity.COMPANY,
        csv: [
          'Name;Geschäft',
          'A GmbH;Großauftrag',
          'B GmbH;Doppelt',
          'C GmbH;Gibt es nicht',
        ].join('\n'),
        mapping: [
          { column: 'Name', field: 'name' },
          { column: 'Geschäft', field: 'custom:hauptgeschaeft' },
        ],
        dryRun: false,
      }),
    );

    expect(bericht.created).toBe(0);
    expect(bericht.rejections.map((r) => r.reason)).toEqual([
      'Geschäft „Großauftrag“ gibt es nicht.',
      'Geschäft „Doppelt“ gibt es nicht.',
      'Geschäft „Gibt es nicht“ gibt es nicht.',
    ]);

    const gesetzt = await als('inhaber', () =>
      firmen.update(workspaceId, leer.id, {
        customFields: { hauptgeschaeft: deal.id },
      }),
    );

    expect(gesetzt.customFields?.hauptgeschaeft).toBe(deal.id);
  });

  it('nennt nicht sichtbare Ziele ohne Namen', async () => {
    const verborgen = await firma('Verborgen GmbH', leute.inhaber.userId);
    const offen = await firma('Offen GmbH', null);
    const deal = await geschaefte.create(workspaceId, { name: 'Großauftrag' });

    const fuerEigene = await als('eigene', () =>
      resolver.verweisTitel(leute.eigene, COMPANY, [verborgen.id, offen.id]),
    );

    expect(fuerEigene).toEqual(
      expect.arrayContaining([
        { id: verborgen.id, titel: null, sichtbar: false },
        { id: offen.id, titel: 'Offen GmbH', sichtbar: true },
      ]),
    );

    expect(
      await als('ohneGeschaefte', () =>
        resolver.verweisTitel(leute.ohneGeschaefte, DEAL, [deal.id]),
      ),
    ).toEqual([{ id: deal.id, titel: null, sichtbar: false }]);

    const fremd = await firma('Fremd', null, fremderId);

    expect(
      await als('inhaber', () =>
        resolver.verweisTitel(leute.inhaber, COMPANY, [fremd.id]),
      ),
    ).toEqual([]);
  });
});

describe('Gegenfeld', () => {
  it('listet die verweisenden Datensätze, Verborgenes nur gezählt', async () => {
    const feld = await partnerfirma();
    const ziel = await firma('Ziel GmbH', null);

    await kontakte.create(workspaceId, {
      firstName: 'Anna',
      lastName: 'A',
      customFields: { partnerfirma: ziel.id },
    });
    await kontakte.create(workspaceId, {
      firstName: 'Bert',
      lastName: 'B',
      customFields: { partnerfirma: ziel.id },
    });
    await kontakte.create(workspaceId, { firstName: 'Cäsar', lastName: 'C' });

    const werte = await als('inhaber', () =>
      resolver.gegenfeldWerte(leute.inhaber, COMPANY, ziel.id),
    );

    expect(werte).toEqual([
      {
        feldId: feld.gegenfeldId,
        quelle: CONTACT,
        eintraege: [
          expect.objectContaining({ titel: 'Anna A' }),
          expect.objectContaining({ titel: 'Bert B' }),
        ],
        nichtSichtbar: 0,
      },
    ]);
  });

  it('zeigt Geschäfte ohne das Recht dafür nur als Anzahl', async () => {
    await beteiligteFirmen();
    const ziel = await firma('Ziel', null);

    await geschaefte.create(workspaceId, {
      name: 'Geheim',
      customFields: { beteiligte_firmen: [ziel.id] },
    });

    const [wert] = await als('ohneGeschaefte', () =>
      resolver.gegenfeldWerte(leute.ohneGeschaefte, COMPANY, ziel.id),
    );

    expect(wert.eintraege).toEqual([]);
    expect(wert.nichtSichtbar).toBe(1);
  });

  it('fehlt, wenn das Feld auf der anderen Seite verborgen ist', async () => {
    await partnerfirma();
    const ziel = await firma('Ziel', null);

    await kontakte.create(workspaceId, {
      firstName: 'A',
      lastName: 'A',
      customFields: { partnerfirma: ziel.id },
    });

    expect(
      await als('feldVerborgen', () =>
        resolver.gegenfeldWerte(leute.feldVerborgen, COMPANY, ziel.id),
      ),
    ).toEqual([]);
  });

  it('gibt es für eine Akte nicht, die man nicht sieht oder die fremd ist', async () => {
    await partnerfirma();
    const verborgen = await firma('Verborgen', leute.inhaber.userId);
    const fremd = await firma('Fremd', null, fremderId);

    await expect(
      als('eigene', () =>
        resolver.gegenfeldWerte(leute.eigene, COMPANY, verborgen.id),
      ),
    ).rejects.toThrow(NotFoundException);
    await expect(
      als('inhaber', () =>
        resolver.gegenfeldWerte(leute.inhaber, COMPANY, fremd.id),
      ),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('Gegenfeld: begrenzt gelesen, gleiches Ergebnis', () => {
  it('zeigt die ersten sichtbaren nach Namen, zählt die verborgenen, einzeln wie als Liste', async () => {
    const eins = await felder.create(workspaceId, {
      entity: COMPANY,
      label: 'Hauptkontakt',
      type: CustomFieldType.RELATION,
      zielEntity: CONTACT,
    });
    const viele = await felder.create(workspaceId, {
      entity: COMPANY,
      label: 'Ansprechpartner',
      type: CustomFieldType.RELATION,
      zielEntity: CONTACT,
      mehrere: true,
      gegenfeldLabel: 'Ansprechpartner von',
    });
    const ziel = await kontakte.create(workspaceId, {
      firstName: 'Zoe',
      lastName: 'Ziel',
    });
    const anderer = await kontakte.create(workspaceId, {
      firstName: 'Otto',
      lastName: 'Anders',
    });
    const fremdeEigentuemerin = leute.inhaber.userId;
    const zeilen: Partial<CompanyEntity>[] = [];

    for (let i = MAX_GEGENFELD_EINTRAEGE + 5; i > 0; i -= 1) {
      const name = `F${String(i).padStart(3, '0')}`;

      zeilen.push({
        workspaceId,
        name,
        ownerId: i % 2 === 0 ? null : leute.eigene.userId,
        customFields: {
          [eins.key]: ziel.id,
          [viele.key]: i % 3 === 0 ? [anderer.id, ziel.id] : [ziel.id],
        },
      });
    }

    for (const name of ['V1', 'V2', 'V3']) {
      zeilen.push({
        workspaceId,
        name,
        ownerId: fremdeEigentuemerin,
        customFields: { [eins.key]: ziel.id, [viele.key]: [ziel.id] },
      });
    }

    zeilen.push(
      {
        workspaceId,
        name: 'A-Papierkorb',
        deletedAt: new Date(),
        customFields: { [eins.key]: ziel.id, [viele.key]: [ziel.id] },
      },
      {
        workspaceId,
        name: 'A-Anderer',
        customFields: { [eins.key]: anderer.id, [viele.key]: [anderer.id] },
      },
    );

    const sichtbareNamen = zeilen
      .filter(
        (zeile) =>
          zeile.deletedAt === undefined &&
          zeile.ownerId !== fremdeEigentuemerin &&
          zeile.name?.startsWith('F') === true,
      )
      .map((zeile) => zeile.name)
      .sort();

    await dataSource.getRepository(CompanyEntity).save(zeilen);

    for (const quelle of [eins, viele]) {
      const inhalt = await als('eigene', () =>
        gegenfeldLesen(dataSource.manager, workspaceId, quelle, ziel.id, true),
      );

      expect(inhalt.eintraege.map((e) => e.titel)).toEqual(
        sichtbareNamen.slice(0, MAX_GEGENFELD_EINTRAEGE),
      );
      expect(inhalt.nichtSichtbar).toBe(3);

      const ohne = await als('eigene', () =>
        gegenfeldLesen(dataSource.manager, workspaceId, quelle, ziel.id, false),
      );

      expect(ohne).toEqual({
        eintraege: [],
        nichtSichtbar: sichtbareNamen.length + 3,
      });
    }
  });
});

describe('Filter', () => {
  it('ist, ist nicht, leer — für einen und für mehrere', async () => {
    await partnerfirma();
    await beteiligteFirmen();
    const a = await firma('Alpha');
    const b = await firma('Beta');

    await kontakte.create(workspaceId, {
      firstName: 'Mit',
      lastName: 'A',
      customFields: { partnerfirma: a.id },
    });
    await kontakte.create(workspaceId, {
      firstName: 'Mit',
      lastName: 'B',
      customFields: { partnerfirma: b.id },
    });
    await kontakte.create(workspaceId, { firstName: 'Ohne', lastName: 'X' });
    await geschaefte.create(workspaceId, {
      name: 'AB',
      customFields: { beteiligte_firmen: [a.id, b.id] },
    });
    await geschaefte.create(workspaceId, {
      name: 'B',
      customFields: { beteiligte_firmen: [b.id] },
    });

    const namen = async (operator: CustomFieldFilterOperator, value?: string) =>
      (
        await kontakte.list(workspaceId, {
          customFilters: [{ key: 'partnerfirma', operator, value }],
          sortField: 'lastName',
        })
      ).items.map((k) => k.lastName);

    expect(await namen(CustomFieldFilterOperator.EQUALS, a.id)).toEqual(['A']);
    expect(await namen(CustomFieldFilterOperator.NOT_EQUALS, a.id)).toEqual([
      'B',
      'X',
    ]);
    expect(await namen(CustomFieldFilterOperator.IS_EMPTY)).toEqual(['X']);

    const deals = await geschaefte.list(workspaceId, {
      customFilters: [
        {
          key: 'beteiligte_firmen',
          operator: CustomFieldFilterOperator.EQUALS,
          value: a.id,
        },
      ],
    });

    expect(deals.items.map((d) => d.name)).toEqual(['AB']);

    await expect(
      kontakte.list(workspaceId, {
        customFilters: [
          {
            key: 'partnerfirma',
            operator: CustomFieldFilterOperator.CONTAINS,
            value: 'Alpha',
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      namen(CustomFieldFilterOperator.EQUALS, 'Alpha'),
    ).rejects.toThrow('mit einem Datensatz verglichen');
  });

  it('filtert nicht nach einem Gegenfeld', async () => {
    const feld = await partnerfirma();
    const gegenfeld = await dataSource
      .getRepository(CustomFieldDefinition)
      .findOneByOrFail({ id: feld.gegenfeldId as string });

    await expect(
      firmen.list(workspaceId, {
        customFilters: [
          {
            key: gegenfeld.key,
            operator: CustomFieldFilterOperator.IS_EMPTY,
          },
        ],
      }),
    ).rejects.toThrow('lässt sich nicht filtern');
  });
});

describe('Papierkorb und Zusammenführen', () => {
  it('blendet Ziele im Papierkorb aus und räumt beim endgültigen Löschen auf', async () => {
    await partnerfirma();
    await beteiligteFirmen();
    const a = await firma('Alpha');
    const b = await firma('Beta');
    const k = await kontakte.create(workspaceId, {
      firstName: 'K',
      lastName: 'K',
      customFields: { partnerfirma: a.id },
    });
    const g = await geschaefte.create(workspaceId, {
      name: 'G',
      customFields: { beteiligte_firmen: [a.id, b.id] },
    });

    await firmen.remove(workspaceId, a.id);

    expect(
      await als('inhaber', () =>
        resolver.verweisTitel(leute.inhaber, COMPANY, [a.id, b.id]),
      ),
    ).toEqual([{ id: b.id, titel: 'Beta', sichtbar: true }]);

    await new PapierkorbService(dataSource).endgueltig(
      workspaceId,
      PapierkorbArt.FIRMA,
      a.id,
    );

    const kontakt = await dataSource
      .getRepository(ContactEntity)
      .findOneByOrFail({ id: k.id });
    const geschaeft = await dataSource
      .getRepository(DealEntity)
      .findOneByOrFail({ id: g.id });

    expect(kontakt.customFields).toEqual({});
    expect(geschaeft.customFields).toEqual({ beteiligte_firmen: [b.id] });
  });

  it('räumt auch beim Leeren nach Ablauf der Frist auf', async () => {
    await partnerfirma();
    const a = await firma('Alpha');
    const k = await kontakte.create(workspaceId, {
      firstName: 'K',
      lastName: 'K',
      customFields: { partnerfirma: a.id },
    });

    await firmen.remove(workspaceId, a.id);
    await dataSource.query(
      `UPDATE companies SET "deletedAt" = now() - interval '400 days' WHERE id = $1`,
      [a.id],
    );
    await new PapierkorbService(dataSource).aufraeumen();

    expect(
      (
        await dataSource
          .getRepository(ContactEntity)
          .findOneByOrFail({ id: k.id })
      ).customFields,
    ).toEqual({});
  });

  it('hängt Verweise beim Zusammenführen auf den behaltenen um', async () => {
    await beteiligteFirmen();
    const behalten = await firma('Muster GmbH');
    const doppelt = await firma('Muster G.m.b.H.');
    const g = await geschaefte.create(workspaceId, {
      name: 'G',
      customFields: { beteiligte_firmen: [doppelt.id, behalten.id] },
    });

    await new DublettenService(dataSource).zusammenfuehren(
      workspaceId,
      'firma',
      behalten.id,
      doppelt.id,
      null,
    );

    expect(
      (await dataSource.getRepository(DealEntity).findOneByOrFail({ id: g.id }))
        .customFields,
    ).toEqual({ beteiligte_firmen: [behalten.id] });
  });
});

describe('Export und Import über Namen', () => {
  it('schreibt Namen, Verborgenes als „Nicht sichtbar“, und liest Namen zurück', async () => {
    await partnerfirma();
    await beteiligteFirmen();
    const offen = await firma('Offen GmbH', null);
    const verborgen = await firma('Verborgen AG', leute.inhaber.userId);

    await geschaefte.create(workspaceId, {
      name: 'Projekt',
      customFields: { beteiligte_firmen: [offen.id, verborgen.id] },
    });

    const exporte = new ExportService(firmen, kontakte, geschaefte, felder);
    const datei = await als('eigene', () => exporte.csv(workspaceId, 'DEAL'));

    expect(datei).toContain('Beteiligte Firmen');
    expect(datei).toContain('Offen GmbH; Nicht sichtbar');
    expect(datei).not.toContain('Verborgen AG');

    const firmenDatei = await exporte.csv(workspaceId, 'COMPANY');

    expect(firmenDatei.split('\n')[0]).not.toContain('Beteiligt an');

    const importe = new ImportService(dataSource, felder);
    const bericht = await als('eigene', () =>
      importe.run(workspaceId, {
        entity: ImportEntity.CONTACT,
        csv: [
          'Vorname;Nachname;Partner',
          'Ida;I;offen gmbh',
          'Jan;J;Verborgen AG',
          'Kim;K;Gibt es nicht',
        ].join('\n'),
        mapping: [
          { column: 'Vorname', field: 'firstName' },
          { column: 'Nachname', field: 'lastName' },
          { column: 'Partner', field: 'custom:partnerfirma' },
        ],
        dryRun: false,
      }),
    );

    expect(bericht.created).toBe(1);
    expect(bericht.rejections.map((r) => r.reason)).toEqual([
      'Firma „Verborgen AG“ gibt es nicht.',
      'Firma „Gibt es nicht“ gibt es nicht.',
    ]);

    const ida = await dataSource
      .getRepository(ContactEntity)
      .findOneByOrFail({ firstName: 'Ida' });

    expect(ida.customFields).toEqual({ partnerfirma: offen.id });
  });

  it('lehnt einen Namen ab, den es mehrfach gibt', async () => {
    await partnerfirma();
    await firma('Doppelt');
    await firma('Doppelt');

    const bericht = await new ImportService(dataSource, felder).run(
      workspaceId,
      {
        entity: ImportEntity.CONTACT,
        csv: ['Vorname;Nachname;Partner', 'Ida;I;Doppelt'].join('\n'),
        mapping: [
          { column: 'Vorname', field: 'firstName' },
          { column: 'Nachname', field: 'lastName' },
          { column: 'Partner', field: 'custom:partnerfirma' },
        ],
        dryRun: false,
      },
    );

    expect(bericht.rejections[0]?.reason).toContain('nicht eindeutig');
  });
});

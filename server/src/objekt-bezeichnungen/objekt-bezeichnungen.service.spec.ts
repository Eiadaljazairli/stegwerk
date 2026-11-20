import 'reflect-metadata';

import {
  BadRequestException,
  type CanActivate,
  ForbiddenException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { type ConfigService } from '@nestjs/config';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingService } from '../billing/billing.service';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { BillingPlan, SubscriptionStatus } from '../billing/plans';
import { SubscriptionEntity } from '../billing/subscription.entity';
import { ExportService } from '../export/export.service';
import { hoereSicherheit, type SicherheitsMeldung } from '../sicherheit/melden';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { InvitationEntity } from '../workspaces/invitation.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { Permission, ROLE_TEMPLATES } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  BezeichnungUngueltig,
  dateiTeil,
  Genus,
  mitBezeichnung,
  ObjektArt,
  ohneBezeichnung,
  VERGEBENE_NAMEN,
} from './objekt-bezeichnungen';
import { ObjektBezeichnungenResolver } from './objekt-bezeichnungen.resolver';
import { ObjektBezeichnungenService } from './objekt-bezeichnungen.service';

const SUITE = 'objekt_bezeichnungen';

jest.setTimeout(60_000);

let dataSource: DataSource;
let dienst: ObjektBezeichnungenService;
let bereich: string;
let andererBereich: string;
const leute: Record<
  'inhaber' | 'admin' | 'mitglied' | 'leser' | 'fremd',
  string
> = { inhaber: '', admin: '', mitglied: '', leser: '', fremd: '' };

const als = (userId: string, workspaceId = bereich): RequestUser => ({
  userId,
  workspaceId,
  email: `${userId}@example.de`,
});

const patienten = {
  art: ObjektArt.KONTAKT,
  einzahl: 'Patient',
  mehrzahl: 'Patienten',
  genus: Genus.MAENNLICH,
};

const neuerBereich = async (name: string) => {
  const repo = dataSource.getRepository(WorkspaceEntity);

  return (await repo.save(repo.create({ name, slug: name.toLowerCase() }))).id;
};

const mitglied = async (
  email: string,
  workspaceId: string,
  key: string,
  role: MembershipRole,
) => {
  const users = dataSource.getRepository(UserEntity);
  const user = await users.save(
    users.create({
      email,
      passwordHash: 'x',
      firstName: 'Test',
      lastName: 'Person',
    }),
  );
  const rolle = await dataSource.getRepository(RoleEntity).findOneOrFail({
    where: { workspaceId, templateKey: key },
  });

  await dataSource
    .getRepository(MembershipEntity)
    .save({ userId: user.id, workspaceId, role, roleId: rolle.id });

  return user.id;
};

const rollenAnlegen = async (workspaceId: string) => {
  const roles = dataSource.getRepository(RoleEntity);

  await roles.save(
    ROLE_TEMPLATES.map((template) =>
      roles.create({
        workspaceId,
        name: template.name,
        description: template.description,
        templateKey: template.key,
        everything: template.everything,
        permissions: [...template.permissions],
        isSystem: true,
      }),
    ),
  );
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  dienst = new ObjektBezeichnungenService(
    dataSource.getRepository(WorkspaceEntity),
    new PermissionsService(
      dataSource.getRepository(MembershipEntity),
      dataSource.getRepository(RoleEntity),
    ),
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE workspaces, users CASCADE');

  bereich = await neuerBereich('Praxis');
  andererBereich = await neuerBereich('Werkstatt');
  await rollenAnlegen(bereich);
  await rollenAnlegen(andererBereich);

  leute.inhaber = await mitglied(
    'inhaber@example.de',
    bereich,
    'owner',
    MembershipRole.OWNER,
  );
  leute.admin = await mitglied(
    'admin@example.de',
    bereich,
    'admin',
    MembershipRole.ADMIN,
  );
  leute.mitglied = await mitglied(
    'mitglied@example.de',
    bereich,
    'member',
    MembershipRole.MEMBER,
  );
  leute.leser = await mitglied(
    'leser@example.de',
    bereich,
    'readonly',
    MembershipRole.MEMBER,
  );
  leute.fremd = await mitglied(
    'fremd@example.de',
    andererBereich,
    'owner',
    MembershipRole.OWNER,
  );
});

const kontakt = async (workspaceId = bereich) =>
  (await dienst.liste(workspaceId)).find((b) => b.art === ObjektArt.KONTAKT);

describe('lesen', () => {
  it('liefert alle fünf Objekte mit den Standardwörtern', async () => {
    const liste = await dienst.liste(bereich);

    expect(liste.map((b) => b.art)).toEqual(Object.values(ObjektArt));
    expect(liste.every((b) => b.istStandard)).toBe(true);
    expect(liste.find((b) => b.art === ObjektArt.GESCHAEFT)).toMatchObject({
      einzahl: 'Geschäft',
      mehrzahl: 'Geschäfte',
      genus: Genus.SAECHLICH,
    });
  });
});

describe('wer umbenennen darf', () => {
  it('der Inhaber', async () => {
    await dienst.setze(als(leute.inhaber), patienten);

    expect(await kontakt()).toMatchObject({
      einzahl: 'Patient',
      mehrzahl: 'Patienten',
      istStandard: false,
      standardMehrzahl: 'Kontakte',
    });
  });

  it('wer das Datenmodell einrichtet (Administrator)', async () => {
    await dienst.setze(als(leute.admin), patienten);

    expect((await kontakt())?.mehrzahl).toBe('Patienten');
  });

  it('kein Mitglied ohne workspace:fields', async () => {
    await expect(dienst.setze(als(leute.mitglied), patienten)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      dienst.zuruecksetzen(als(leute.mitglied), null),
    ).rejects.toThrow(ForbiddenException);
  });

  it('keine Rolle „Nur Lesen“', async () => {
    await expect(dienst.setze(als(leute.leser), patienten)).rejects.toThrow(
      ForbiddenException,
    );

    expect((await kontakt())?.istStandard).toBe(true);
  });

  it('kein API-Schlüssel ohne workspace:fields, einer mit schon', async () => {
    const schluessel = (permissions: string[]): RequestUser => ({
      ...als(leute.inhaber),
      apiKey: {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Probe',
        permissions,
      },
    });

    await expect(
      dienst.setze(
        schluessel([Permission.CONTACT_VIEW, Permission.CONTACT_WRITE]),
        patienten,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      dienst.zuruecksetzen(schluessel([Permission.CONTACT_VIEW]), null),
    ).rejects.toThrow(ForbiddenException);
    expect((await kontakt())?.istStandard).toBe(true);

    await dienst.setze(schluessel([Permission.FIELD_MANAGE]), patienten);
    expect((await kontakt())?.mehrzahl).toBe('Patienten');
  });

  it('niemand aus einem fremden Bereich', async () => {
    await expect(
      dienst.setze(als(leute.fremd, bereich), patienten),
    ).rejects.toThrow(ForbiddenException);

    expect((await kontakt())?.istStandard).toBe(true);
  });
});

describe('Mandantentrennung', () => {
  it('ändert nur den eigenen Bereich', async () => {
    await dienst.setze(als(leute.fremd, andererBereich), {
      art: ObjektArt.GESCHAEFT,
      einzahl: 'Auftrag',
      mehrzahl: 'Aufträge',
      genus: Genus.MAENNLICH,
    });

    const hier = await dienst.liste(bereich);
    const dort = await dienst.liste(andererBereich);

    expect(hier.find((b) => b.art === ObjektArt.GESCHAEFT)?.mehrzahl).toBe(
      'Geschäfte',
    );
    expect(dort.find((b) => b.art === ObjektArt.GESCHAEFT)?.mehrzahl).toBe(
      'Aufträge',
    );
  });
});

describe('prüfen', () => {
  it('kürzt Leerraum und schreibt groß', async () => {
    await dienst.setze(als(leute.inhaber), {
      ...patienten,
      einzahl: '  patient ',
      mehrzahl: 'patienten   ',
    });

    expect(await kontakt()).toMatchObject({
      einzahl: 'Patient',
      mehrzahl: 'Patienten',
    });
  });

  it.each([
    ['leer', '   '],
    ['zu lang', 'A'.repeat(31)],
    ['mit spitzer Klammer', '<b>Kunde</b>'],
    ['mit Anführungszeichen', 'Kunde"'],
  ])('lehnt ab: %s', async (_fall, einzahl) => {
    await expect(
      dienst.setze(als(leute.inhaber), { ...patienten, einzahl }),
    ).rejects.toThrow(BadRequestException);
  });

  it('lehnt einen Namen ab, den schon ein anderes Objekt trägt', async () => {
    await expect(
      dienst.setze(als(leute.inhaber), {
        ...patienten,
        einzahl: 'Firma',
        mehrzahl: 'Firmen',
      }),
    ).rejects.toThrow('heißt schon ein anderes Objekt');
  });

  it.each([
    ['Rechnung', 'Rechnungen'],
    ['Artikel', 'Artikel'],
    ['Termin', 'Kalender'],
    ['Übersicht', 'Übersichten'],
    ['notiz', 'Notizen'],
  ])(
    'lehnt den Namen einer anderen Seite ab: %s / %s',
    async (einzahl, mehrzahl) => {
      await expect(
        dienst.setze(als(leute.inhaber), {
          ...patienten,
          einzahl,
          mehrzahl,
        }),
      ).rejects.toThrow('heißt schon eine andere Seite');
      expect((await kontakt())?.istStandard).toBe(true);
    },
  );

  it('nimmt Umlaute, Bindestrich und Ziffern', async () => {
    await dienst.setze(als(leute.inhaber), {
      art: ObjektArt.GESCHAEFT,
      einzahl: 'Kfz-Auftrag 2',
      mehrzahl: 'Kfz-Aufträge',
      genus: Genus.MAENNLICH,
    });

    expect(
      (await dienst.liste(bereich)).find((b) => b.art === ObjektArt.GESCHAEFT)
        ?.mehrzahl,
    ).toBe('Kfz-Aufträge');
  });
});

describe('zurücksetzen', () => {
  it('setzt eine Art zurück und lässt die andere', async () => {
    await dienst.setze(als(leute.inhaber), patienten);
    await dienst.setze(als(leute.inhaber), {
      art: ObjektArt.FIRMA,
      einzahl: 'Praxis',
      mehrzahl: 'Praxen',
      genus: Genus.WEIBLICH,
    });

    const liste = await dienst.zuruecksetzen(
      als(leute.inhaber),
      ObjektArt.KONTAKT,
    );

    expect(liste.find((b) => b.art === ObjektArt.KONTAKT)?.istStandard).toBe(
      true,
    );
    expect(liste.find((b) => b.art === ObjektArt.FIRMA)?.mehrzahl).toBe(
      'Praxen',
    );
  });

  it('setzt ohne Art alle zurück', async () => {
    await dienst.setze(als(leute.inhaber), patienten);

    const liste = await dienst.zuruecksetzen(als(leute.inhaber), null);

    expect(liste.every((b) => b.istStandard)).toBe(true);
  });

  it('wer den Standard eintippt, ist wieder beim Standard', async () => {
    await dienst.setze(als(leute.inhaber), patienten);
    await dienst.setze(als(leute.inhaber), {
      ...patienten,
      einzahl: 'Kontakt',
      mehrzahl: 'Kontakte',
    });

    expect((await kontakt())?.istStandard).toBe(true);
  });
});

describe('gleichzeitig', () => {
  it('verliert keine Änderung, wenn zwei zugleich umbenennen', async () => {
    await Promise.all([
      dienst.setze(als(leute.inhaber), patienten),
      dienst.setze(als(leute.admin), {
        art: ObjektArt.FIRMA,
        einzahl: 'Praxis',
        mehrzahl: 'Praxen',
        genus: Genus.WEIBLICH,
      }),
      dienst.setze(als(leute.inhaber), {
        art: ObjektArt.GESCHAEFT,
        einzahl: 'Auftrag',
        mehrzahl: 'Aufträge',
        genus: Genus.MAENNLICH,
      }),
    ]);

    const liste = await dienst.liste(bereich);

    expect(
      Object.fromEntries(liste.map((b) => [b.art, b.mehrzahl])),
    ).toMatchObject({
      [ObjektArt.KONTAKT]: 'Patienten',
      [ObjektArt.FIRMA]: 'Praxen',
      [ObjektArt.GESCHAEFT]: 'Aufträge',
    });
  });

  it('lässt nicht zwei Objekte zugleich denselben Namen nehmen', async () => {
    const ergebnisse = await Promise.allSettled([
      dienst.setze(als(leute.inhaber), patienten),
      dienst.setze(als(leute.admin), { ...patienten, art: ObjektArt.FIRMA }),
    ]);

    expect(ergebnisse.filter((e) => e.status === 'fulfilled')).toHaveLength(1);

    const namen = (await dienst.liste(bereich)).map((b) => b.mehrzahl);

    expect(namen.filter((n) => n === 'Patienten')).toHaveLength(1);
  });
});

describe('Abo', () => {
  it('prüft das Abo hinter der Anmeldung', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        ObjektBezeichnungenResolver,
      ) as unknown,
    ).toEqual([GqlAuthGuard, BillingWriteGuard]);
  });

  describe('bei abgelaufenem Abo', () => {
    let wache: CanActivate;
    let resolver: ObjektBezeichnungenResolver;

    const mitKasse = {
      get: (schluessel: string) =>
        schluessel === 'stripeSecretKey' ? 'sk_test_probe' : undefined,
    } as unknown as ConfigService;

    const ueberDieWache = async <T>(
      methode: keyof ObjektBezeichnungenResolver,
      aufruf: () => Promise<T>,
    ): Promise<T> => {
      const art = Reflect.getMetadata(
        'graphql:resolver_type',
        ObjektBezeichnungenResolver.prototype[methode],
      ) as string;
      const kontext = new ExecutionContextHost([
        undefined,
        {},
        { req: { user: als(leute.inhaber) } },
        { operation: { operation: art.toLowerCase() } },
      ]);

      kontext.setType('graphql');

      if (!(await wache.canActivate(kontext))) {
        throw new ForbiddenException();
      }

      return aufruf();
    };

    beforeEach(async () => {
      await dienst.setze(als(leute.inhaber), patienten);

      const m = dataSource.manager;

      await m.save(
        m.create(SubscriptionEntity, {
          workspaceId: bereich,
          plan: BillingPlan.STARTER,
          status: SubscriptionStatus.CANCELED,
          currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
        }),
      );

      const billing = new BillingService(
        dataSource.getRepository(SubscriptionEntity),
        dataSource.getRepository(MembershipEntity),
        dataSource.getRepository(InvitationEntity),
        mitKasse,
      );

      await expect(billing.getEntitlement(bereich)).resolves.toMatchObject({
        canWrite: false,
      });

      wache = new BillingWriteGuard(billing);
      resolver = new ObjektBezeichnungenResolver(dienst);
    });

    it('liest weiter', async () => {
      const liste = await ueberDieWache('objektBezeichnungen', () =>
        resolver.objektBezeichnungen(als(leute.inhaber)),
      );

      expect(liste.find((b) => b.art === ObjektArt.KONTAKT)?.mehrzahl).toBe(
        'Patienten',
      );
    });

    it('benennt nicht um', async () => {
      await expect(
        ueberDieWache('setzeObjektBezeichnung', () =>
          resolver.setzeObjektBezeichnung(als(leute.inhaber), {
            art: ObjektArt.FIRMA,
            einzahl: 'Praxis',
            mehrzahl: 'Praxen',
            genus: Genus.WEIBLICH,
          }),
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(
        (await dienst.liste(bereich)).find((b) => b.art === ObjektArt.FIRMA)
          ?.istStandard,
      ).toBe(true);
    });

    it('setzt nicht zurück', async () => {
      await expect(
        ueberDieWache('setzeObjektBezeichnungZurueck', () =>
          resolver.setzeObjektBezeichnungZurueck(als(leute.inhaber)),
        ),
      ).rejects.toThrow(ForbiddenException);

      expect((await kontakt())?.mehrzahl).toBe('Patienten');
    });
  });
});

describe('Protokoll', () => {
  it('meldet die Änderung mit vorher und nachher', async () => {
    const gehoert: SicherheitsMeldung[] = [];
    const aus = hoereSicherheit((m) => gehoert.push(m));

    try {
      await dienst.setze(als(leute.inhaber), patienten);
    } finally {
      aus();
    }

    expect(gehoert).toContainEqual(
      expect.objectContaining({
        art: 'objekt_bezeichnung',
        workspaceId: bereich,
        actorId: leute.inhaber,
        details: {
          objekt: 'KONTAKT',
          vorher: 'Kontakt / Kontakte',
          nachher: 'Patient / Patienten',
        },
      }),
    );
  });
});

describe('Dateiname des Exports', () => {
  it('trägt die eigene Mehrzahl, in ASCII', () => {
    const exporte = new ExportService(
      null as never,
      null as never,
      null as never,
      null as never,
    );

    expect(exporte.fileName('DEAL', 'Aufträge')).toMatch(
      /^Auftraege-\d{4}-\d{2}-\d{2}\.csv$/u,
    );
    expect(exporte.fileName('COMPANY')).toMatch(/^Firmen-/u);
    expect(exporte.fileName('CONTACT', '***')).toMatch(/^Kontakte-/u);
  });

  it('dateiTeil ersetzt Umlaute und Leerzeichen', () => {
    expect(dateiTeil('Große Kunden', 'x')).toBe('Grosse-Kunden');
    expect(dateiTeil('Écoles', 'x')).toBe('Ecoles');
  });
});

describe('reine Prüfung', () => {
  it('führt die Namen von Navigation und Suche als vergeben', () => {
    for (const name of ['Rechnungen', 'Kalender', 'Artikel', 'Übersicht']) {
      expect(VERGEBENE_NAMEN).toContain(name);
    }

    expect(VERGEBENE_NAMEN).not.toContain('Kontakte');
    expect(VERGEBENE_NAMEN).not.toContain('Firma');
  });

  it('lehnt ein unbekanntes Geschlecht ab', () => {
    expect(() =>
      mitBezeichnung({}, ObjektArt.FIRMA, {
        einzahl: 'Praxis',
        mehrzahl: 'Praxen',
        genus: 'X' as Genus,
      }),
    ).toThrow(BezeichnungUngueltig);
  });

  it('ohneBezeichnung lässt die Eingabe unverändert', () => {
    const vorher = {
      [ObjektArt.FIRMA]: {
        einzahl: 'Praxis',
        mehrzahl: 'Praxen',
        genus: Genus.WEIBLICH,
      },
    };

    expect(ohneBezeichnung(vorher, ObjektArt.FIRMA)).toEqual({});
    expect(vorher[ObjektArt.FIRMA].einzahl).toBe('Praxis');
  });
});

import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { AuditLogEntity } from '../../audit/audit-log.entity';
import { AuditSubscriber } from '../../audit/audit.subscriber';
import { type RequestUser } from '../../auth/decorators/current-user.decorator';
import { CustomFieldDefinition } from '../../custom-fields/custom-field.entity';
import { CustomFieldsService } from '../../custom-fields/custom-fields.service';
import { runWithRequestContext } from '../../observability/request-context';
import {
  createTestDatabase,
  dropTestDatabase,
} from '../../testing/test-database';
import { UserEntity } from '../../users/user.entity';
import { sichereRoheAnfrage } from '../../webhooks/webhook-ziel';
import {
  MembershipEntity,
  MembershipRole,
} from '../../workspaces/membership.entity';
import { Permission } from '../../workspaces/permissions';
import { PermissionsService } from '../../workspaces/permissions.service';
import { RoleEntity } from '../../workspaces/role.entity';
import { setzeSichtfeld } from '../../workspaces/sichtbarkeit';
import { WorkspaceEntity } from '../../workspaces/workspace.entity';
import { CompaniesService } from '../companies.service';
import { CompanyEntity } from '../entities/company.entity';
import { AnreicherungResolver } from './anreicherung.resolver';
import { AnreicherungService } from './anreicherung.service';
import { BereichsDrossel } from './drossel';
import { FirmenlogoEntity } from './firmenlogo.entity';

const SUITE = 'anreicherung';

jest.setTimeout(60_000);

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 3),
]);
const ICO = Buffer.concat([
  Buffer.from([0, 0, 1, 0, 1, 0]),
  Buffer.alloc(40, 9),
]);

const STARTSEITE = `<html><head>
<link rel="icon" type="image/svg+xml" href="/logo.svg">
<link rel="apple-touch-icon" href="/apple.png">
</head><body><nav><a href="/impressum/">Impressum</a></nav><h1>Willkommen</h1></body></html>`;

const IMPRESSUM = `<html><body><nav><a href="/">Start</a> <a href="/impressum/">Impressum</a></nav>
<h1>Impressum</h1><p>Angaben gemäß § 5 DDG</p>
<p>Nordwind Haustechnik GmbH<br>Hafenstraße 12a<br>20457 Hamburg<br>Deutschland</p>
<p>Vertreten durch: Jana Krüger</p>
<p>Telefon: 040 1234560<br>E-Mail: info@nordwind.example</p>
<p>Registergericht: Amtsgericht Hamburg<br>Registernummer: HRB 123456</p>
<p>USt-IdNr.: DE123456789</p></body></html>`;

const website = (ohneBilder: boolean) =>
  createServer((anfrage, antwort) => {
    const pfad = anfrage.url ?? '/';
    const html = (rumpf: string) => {
      antwort.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      antwort.end(rumpf);
    };

    if (pfad === '/' || pfad === '/gross/') {
      html(
        pfad === '/gross/'
          ? STARTSEITE.replace('/apple.png', '/riesig.png')
          : STARTSEITE,
      );
    } else if (pfad === '/impressum/') {
      html(IMPRESSUM);
    } else if (!ohneBilder && pfad === '/apple.png') {
      antwort.writeHead(200, { 'content-type': 'image/png' });
      antwort.end(PNG);
    } else if (!ohneBilder && pfad === '/riesig.png') {
      antwort.writeHead(200, { 'content-type': 'image/png' });
      antwort.end(Buffer.concat([PNG, Buffer.alloc(300 * 1024)]));
    } else if (!ohneBilder && pfad === '/favicon.ico') {
      antwort.writeHead(200, { 'content-type': 'text/plain' });
      antwort.end(ICO);
    } else if (pfad === '/logo.svg') {
      antwort.writeHead(200, { 'content-type': 'image/svg+xml' });
      antwort.end(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>',
      );
    } else {
      antwort.writeHead(404);
      antwort.end();
    }
  });

const starte = async (server: Server): Promise<string> => {
  await new Promise<void>((fertig) =>
    server.listen(0, '127.0.0.1', () => fertig()),
  );

  return `https://127.0.0.1:${String((server.address() as AddressInfo).port)}/`;
};

let dataSource: DataSource;
let permissions: PermissionsService;
let firmen: CompaniesService;
let dienst: AnreicherungService;
let resolver: AnreicherungResolver;
let mitBildern: Server;
let ohneBilder: Server;
let adresse: string;
let adresseOhneBilder: string;
let workspaceId: string;
let inhaberin: RequestUser;
let leserin: RequestUser;
let aussendienst: RequestUser;
let fremde: RequestUser;

const als = <T>(wer: RequestUser, tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext(
    { requestId: 'test', userId: wer.userId, workspaceId: wer.workspaceId },
    () => {
      setzeSichtfeld(() => permissions.sichtfeldFuer(wer));

      return tun();
    },
  );

const firma = async (
  name: string,
  extra: Partial<CompanyEntity> = {},
): Promise<CompanyEntity> => {
  return firmen.create(workspaceId, {
    name,
    ownerId: inhaberin.userId,
    website: adresse,
    ...extra,
  });
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  new AuditSubscriber(dataSource);
  permissions = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );
  firmen = new CompaniesService(
    dataSource.getRepository(CompanyEntity),
    new CustomFieldsService(dataSource.getRepository(CustomFieldDefinition)),
  );
  dienst = new AnreicherungService(
    firmen,
    dataSource.getRepository(FirmenlogoEntity),
  );
  dienst.erlaubeIntern = true;
  dienst.anfrager = (url, ...rest) =>
    sichereRoheAnfrage(
      new URL(url.toString().replace(/^https:/u, 'http:')),
      ...rest,
    );
  resolver = new AnreicherungResolver(dienst, permissions);

  mitBildern = website(false);
  ohneBilder = website(true);
  adresse = await starte(mitBildern);
  adresseOhneBilder = await starte(ohneBilder);

  const m = dataSource.manager;
  const bereich = await m.save(
    m.create(WorkspaceEntity, { name: 'Anreicherung', slug: 'anreicherung' }),
  );
  const anderer = await m.save(
    m.create(WorkspaceEntity, { name: 'Anderer', slug: 'anderer' }),
  );

  workspaceId = bereich.id;

  const person = (email: string) =>
    m.save(
      m.create(UserEntity, {
        email,
        passwordHash: 'x',
        firstName: email.split('@')[0],
        lastName: 'Test',
      }),
    );
  const [anna, lea, alex, frieda] = await Promise.all([
    person('anna@an.test'),
    person('lea@an.test'),
    person('alex@an.test'),
    person('frieda@an.test'),
  ]);
  const nurLesen = await m.save(
    m.create(RoleEntity, {
      workspaceId,
      name: 'Nur lesen',
      everything: false,
      permissions: [Permission.COMPANY_VIEW],
      sichtbarkeit: { company: 'alle', contact: 'alle', deal: 'alle' },
      isSystem: false,
    }),
  );
  const nurEigene = await m.save(
    m.create(RoleEntity, {
      workspaceId,
      name: 'Außendienst',
      everything: false,
      permissions: [Permission.COMPANY_VIEW, Permission.COMPANY_WRITE],
      sichtbarkeit: { company: 'eigene', contact: 'alle', deal: 'alle' },
      isSystem: false,
    }),
  );

  await m.save([
    m.create(MembershipEntity, {
      userId: anna.id,
      workspaceId,
      role: MembershipRole.OWNER,
    }),
    m.create(MembershipEntity, {
      userId: lea.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: nurLesen.id,
    }),
    m.create(MembershipEntity, {
      userId: alex.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: nurEigene.id,
    }),
    m.create(MembershipEntity, {
      userId: frieda.id,
      workspaceId: anderer.id,
      role: MembershipRole.OWNER,
    }),
  ]);

  inhaberin = { userId: anna.id, workspaceId, email: anna.email };
  leserin = { userId: lea.id, workspaceId, email: lea.email };
  aussendienst = { userId: alex.id, workspaceId, email: alex.email };
  fremde = { userId: frieda.id, workspaceId: anderer.id, email: frieda.email };
});

afterAll(async () => {
  await Promise.all(
    [mitBildern, ohneBilder].map(
      (server) => new Promise((fertig) => server.close(fertig)),
    ),
  );
  await dropTestDatabase(dataSource, SUITE);
});

describe('Daten aus dem Impressum', () => {
  it('zeigt, was im Impressum steht, und übernimmt nur in leere Felder', async () => {
    const nordwind = await firma('Nordwind', { city: 'Altona' });

    const vorschau = await als(inhaberin, () =>
      resolver.impressumLesen(inhaberin, nordwind.id),
    );

    expect(vorschau.quelle).toBe(`${adresse}impressum/`);

    const nach = Object.fromEntries(
      vorschau.felder.map((feld) => [feld.feld, feld]),
    );

    expect(nach.name).toMatchObject({
      wert: 'Nordwind Haustechnik GmbH',
      aktuell: 'Nordwind',
      uebernehmbar: false,
    });
    expect(nach.city).toMatchObject({
      wert: 'Hamburg',
      aktuell: 'Altona',
      uebernehmbar: false,
      grund: 'Schon belegt; überschrieben wird nichts.',
    });
    expect(nach.street).toMatchObject({
      wert: 'Hafenstraße 12a',
      uebernehmbar: true,
    });
    expect(nach.ustIdNr.wert).toBe('DE123456789');
    expect(nach.website).toBeUndefined();

    const gewaehlt = vorschau.felder
      .filter((feld) => feld.feld !== 'email')
      .map(({ feld, wert }) => ({ feld, wert }));
    const danach = await als(inhaberin, () =>
      resolver.impressumUebernehmen(inhaberin, {
        companyId: nordwind.id,
        werte: gewaehlt,
      }),
    );

    expect(danach).toMatchObject({
      name: 'Nordwind',
      city: 'Altona',
      street: 'Hafenstraße 12a',
      postalCode: '20457',
      country: 'Deutschland',
      phone: '+49401234560',
      email: null,
      vertretung: 'Jana Krüger',
      registergericht: 'Amtsgericht Hamburg',
      registernummer: 'HRB 123456',
      ustIdNr: 'DE123456789',
    });

    const verlauf = await dataSource.manager.find(AuditLogEntity, {
      where: { entityId: nordwind.id, herkunft: 'impressum' },
    });

    expect(verlauf).toHaveLength(1);
    expect(Object.keys(verlauf[0].changes ?? {}).sort()).toEqual(
      [
        'country',
        'phone',
        'postalCode',
        'registergericht',
        'registernummer',
        'street',
        'ustIdNr',
        'vertretung',
      ].sort(),
    );
    expect(verlauf[0].actorId).toBe(inhaberin.userId);
  });

  it('lehnt fremde Felder ab und meldet, wenn nichts mehr frei ist', async () => {
    const voll = await firma('Voll', { city: 'Kiel' });

    await expect(
      als(inhaberin, () =>
        resolver.impressumUebernehmen(inhaberin, {
          companyId: voll.id,
          werte: [{ feld: 'annualRevenue', wert: '1000000' }],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      als(inhaberin, () =>
        resolver.impressumUebernehmen(inhaberin, {
          companyId: voll.id,
          werte: [{ feld: 'city', wert: 'Hamburg' }],
        }),
      ),
    ).rejects.toThrow(/Nichts zu übernehmen/u);
    await expect(
      als(inhaberin, () =>
        resolver.impressumUebernehmen(inhaberin, {
          companyId: voll.id,
          werte: [{ feld: 'email', wert: 'keine adresse' }],
        }),
      ),
    ).rejects.toThrow(/ungültig/u);
  });

  it('bietet Felder nicht an, die die Rolle nur lesen darf, und übergeht sie beim Übernehmen', async () => {
    const gesperrt = await firma('Gesperrt');
    const mitFeldrecht = <T>(tun: () => Promise<T>) =>
      runWithRequestContext(
        {
          requestId: 'test',
          userId: inhaberin.userId,
          sichtfeld: () =>
            Promise.resolve({
              ich: inhaberin.userId,
              arten: { company: 'alle', contact: 'alle', deal: 'alle' },
              felder: { 'company.phone': 'lesen' },
            }),
        },
        tun,
      );

    const vorschau = await mitFeldrecht(() =>
      dienst.impressumVorschau(workspaceId, gesperrt.id),
    );

    expect(vorschau.felder.find((feld) => feld.feld === 'phone')).toMatchObject(
      {
        uebernehmbar: false,
        grund: 'Ihre Rolle darf dieses Feld nicht ändern.',
      },
    );

    const danach = await mitFeldrecht(() =>
      dienst.uebernehmen(workspaceId, gesperrt.id, [
        { feld: 'phone', wert: '040 1234560' },
        { feld: 'city', wert: 'Hamburg' },
      ]),
    );

    expect(danach.phone).toBeNull();
    expect(danach.city).toBe('Hamburg');
  });

  it('verlangt eine Website oder Domain', async () => {
    const ohne = await firmen.create(workspaceId, { name: 'Ohne Website' });

    await expect(
      als(inhaberin, () => resolver.impressumLesen(inhaberin, ohne.id)),
    ).rejects.toThrow(/weder eine Website noch eine Domain/u);
  });
});

describe('Rechte', () => {
  it('lässt eine Rolle, die Firmen nur sieht, nichts abrufen oder ändern', async () => {
    const ziel = await firma('Nur sehen');

    for (const tun of [
      (): Promise<unknown> => resolver.impressumLesen(leserin, ziel.id),
      () => resolver.firmenlogoLaden(leserin, ziel.id),
      () => resolver.firmenlogoEntfernen(leserin, ziel.id),
      () =>
        resolver.impressumUebernehmen(leserin, {
          companyId: ziel.id,
          werte: [{ feld: 'phone', wert: '040 1' }],
        }),
    ]) {
      await expect(als<unknown>(leserin, tun)).rejects.toThrow(
        ForbiddenException,
      );
    }
  });

  it('ruft für eine Firma hinter den Zeilenrechten nichts ab', async () => {
    const fremdeFirma = await firma('Gehört Anna');
    const anfragen: string[] = [];
    const vorher = dienst.anfrager;

    dienst.anfrager = (url, ...rest) => {
      anfragen.push(url.toString());

      return vorher(url, ...rest);
    };

    try {
      await expect(
        als(aussendienst, () =>
          resolver.impressumLesen(aussendienst, fremdeFirma.id),
        ),
      ).rejects.toThrow(NotFoundException);
      await expect(
        als(aussendienst, () =>
          resolver.firmenlogoLaden(aussendienst, fremdeFirma.id),
        ),
      ).rejects.toThrow(NotFoundException);
    } finally {
      dienst.anfrager = vorher;
    }

    expect(anfragen).toEqual([]);
  });

  it('kennt die Firma eines anderen Bereichs nicht', async () => {
    const hier = await firma('Hier');

    await expect(
      als(fremde, () => resolver.impressumLesen(fremde, hier.id)),
    ).rejects.toThrow(NotFoundException);
    await expect(
      als(fremde, () =>
        resolver.impressumUebernehmen(fremde, {
          companyId: hier.id,
          werte: [{ feld: 'phone', wert: '040 1' }],
        }),
      ),
    ).rejects.toThrow(NotFoundException);
    await expect(
      als(fremde, () => resolver.firmenlogoEntfernen(fremde, hier.id)),
    ).rejects.toThrow(NotFoundException);
  });

  it('bremst je Bereich und zählt dabei jede Anfrage, nicht den Klick', async () => {
    const ziel = await firma('Gebremst');
    const vorher = dienst.drossel;

    (dienst as { drossel: BereichsDrossel }).drossel = new BereichsDrossel(
      2,
      60_000,
    );

    try {
      await als(inhaberin, () => resolver.impressumLesen(inhaberin, ziel.id));
      await expect(
        als(inhaberin, () => resolver.firmenlogoLaden(inhaberin, ziel.id)),
      ).rejects.toThrow(HttpException);

      (dienst as { drossel: BereichsDrossel }).drossel = new BereichsDrossel(
        1,
        60_000,
      );
      await expect(
        als(inhaberin, () => resolver.impressumLesen(inhaberin, ziel.id)),
      ).rejects.toThrow(/Seiten und Bilder/u);
    } finally {
      (dienst as { drossel: BereichsDrossel }).drossel = vorher;
    }
  });
});

describe('Firmenlogo', () => {
  it('holt das apple-touch-icon einmal, zeigt es als Bild und entfernt es wieder', async () => {
    const ziel = await firma('Mit Logo');

    await als(inhaberin, () => resolver.firmenlogoLaden(inhaberin, ziel.id));

    const gelesen = await firmen.findOne(workspaceId, ziel.id);

    expect(await resolver.logo(gelesen)).toBe(
      `data:image/png;base64,${PNG.toString('base64')}`,
    );
    expect(await resolver.logoQuelle(gelesen)).toBe(`${adresse}apple.png`);

    const verlauf = await dataSource.manager.find(AuditLogEntity, {
      where: { entityId: ziel.id, herkunft: 'website' },
    });

    expect(verlauf.map((eintrag) => eintrag.changes)).toEqual([
      { logo: [null, '127.0.0.1'] },
    ]);

    await als(inhaberin, () =>
      resolver.firmenlogoEntfernen(inhaberin, ziel.id),
    );

    expect(
      await resolver.logo(await firmen.findOne(workspaceId, ziel.id)),
    ).toBeNull();
  });

  it('übergeht ein zu großes Bild und SVG und nimmt dann favicon.ico nach seinem Inhalt', async () => {
    const ziel = await firma('Großes Logo', { website: `${adresse}gross/` });

    await als(inhaberin, () => resolver.firmenlogoLaden(inhaberin, ziel.id));

    const logo = await dienst.logo(workspaceId, ziel.id);

    expect(logo?.mime).toBe('image/x-icon');
    expect(logo?.quelle).toBe(`${adresse}favicon.ico`);
  });

  it('meldet, wenn die Website kein passendes Bild hat', async () => {
    const ziel = await firma('Nur SVG', { website: adresseOhneBilder });

    await expect(
      als(inhaberin, () => resolver.firmenlogoLaden(inhaberin, ziel.id)),
    ).rejects.toThrow(/kein passendes Logo/u);
    expect(await dienst.logo(workspaceId, ziel.id)).toBeNull();
  });

  it('geht mit der Firma, wenn sie endgültig gelöscht wird', async () => {
    const ziel = await firma('Weg damit');

    await als(inhaberin, () => resolver.firmenlogoLaden(inhaberin, ziel.id));
    await dataSource.getRepository(CompanyEntity).delete(ziel.id);

    expect(await dienst.logo(workspaceId, ziel.id)).toBeNull();
  });
});

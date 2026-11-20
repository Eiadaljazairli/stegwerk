import { BadRequestException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { CompaniesService } from './companies.service';
import { ContactsService } from './contacts.service';
import { bereinigeZweitdomains, domainVon } from './domains';
import { herkunftFuer } from './herkunft';
import { CompanyEntity } from './entities/company.entity';
import { ContactEntity } from './entities/contact.entity';

const SUITE = 'firma_kontakt_felder';

jest.setTimeout(60_000);

let dataSource: DataSource;
let firmen: CompaniesService;
let kontakte: ContactsService;
let workspaceId: string;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);

  const felder = new CustomFieldsService(
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
  workspaceId = (
    await dataSource
      .getRepository(WorkspaceEntity)
      .save({ name: 'Wir', slug: 'wir' })
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

describe('Domains', () => {
  it('schreibt eine Domain klein, ohne https, www. und Pfad', () => {
    expect(domainVon('https://www.Nordwind.DE/kontakt?x=1')).toBe(
      'nordwind.de',
    );
    expect(domainVon('  ')).toBeNull();
  });

  it('bereinigt weitere Domains und weist Freemailer ab', () => {
    expect(
      bereinigeZweitdomains(
        ['www.nordwind-logistik.de', 'NORDWIND-LOGISTIK.de', 'nordwind.de'],
        'nordwind.de',
      ),
    ).toEqual(['nordwind-logistik.de']);
    expect(() => bereinigeZweitdomains(['gmail.com'], null)).toThrow(
      BadRequestException,
    );
    expect(() => bereinigeZweitdomains(['kein domain'], null)).toThrow(
      BadRequestException,
    );
    expect(
      bereinigeZweitdomains(['gmail.com', 'x.de'], null, { still: true }),
    ).toEqual(['x.de']);
  });
});

describe('die Firma', () => {
  it('speichert Domain, weitere Domains, Website und LinkedIn bereinigt', async () => {
    const firma = await firmen.create(workspaceId, {
      name: 'Nordwind',
      domain: 'https://www.Nordwind.de/',
      zweitdomains: ['nordwind-logistik.de', 'nordwind.de'],
      website: 'nordwind.de',
      linkedin: 'linkedin.com/company/nordwind',
    });

    expect(firma.domain).toBe('nordwind.de');
    expect(firma.zweitdomains).toEqual(['nordwind-logistik.de']);
    expect(firma.website).toBe('https://nordwind.de/');
    expect(firma.linkedin).toBe('https://linkedin.com/company/nordwind');

    const geleert = await firmen.update(workspaceId, firma.id, {
      website: '',
      zweitdomains: [],
    });

    expect(geleert.website).toBeNull();
    expect(geleert.zweitdomains).toEqual([]);
  });

  it('weist eine Website ab, die nicht https ist', async () => {
    await expect(
      firmen.create(workspaceId, {
        name: 'Unsicher',
        website: 'http://unsicher.de',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('findet eine Firma über eine weitere Domain in der Suche', async () => {
    await firmen.create(workspaceId, {
      name: 'Südwind',
      zweitdomains: ['suedwind-alt.de'],
    });

    const treffer = await firmen.list(workspaceId, { search: 'suedwind-alt' });

    expect(treffer.items.map((firma) => firma.name)).toEqual(['Südwind']);
  });
});

describe('der Kontakt', () => {
  it('hat eine eigene Anschrift und LinkedIn', async () => {
    const kontakt = await kontakte.create(workspaceId, {
      firstName: 'Anna',
      lastName: 'Schmidt',
      street: 'Gartenweg 2',
      postalCode: '24103',
      city: 'Kiel',
      country: 'Deutschland',
      linkedin: 'https://www.linkedin.com/in/anna',
    });

    expect(kontakt.city).toBe('Kiel');
    expect(kontakt.linkedin).toBe('https://www.linkedin.com/in/anna');

    const treffer = await kontakte.list(workspaceId, {
      customFilters: [
        { key: 'std:city', operator: 'equals' as never, value: 'kiel' },
      ],
    });

    expect(treffer.items.map((k) => k.lastName)).toContain('Schmidt');
  });
});

describe('Konzern', () => {
  it('hängt eine Tochter an ihre Mutter und listet die Töchter', async () => {
    const mutter = await firmen.create(workspaceId, { name: 'Holding' });
    const tochter = await firmen.create(workspaceId, {
      name: 'Tochter',
      parentCompanyId: mutter.id,
    });

    expect(tochter.parentCompanyId).toBe(mutter.id);
    expect(
      (await firmen.tochterfirmen(workspaceId, mutter.id)).map((f) => f.name),
    ).toEqual(['Tochter']);
    expect((await firmen.mutterfirma(workspaceId, tochter))?.name).toBe(
      'Holding',
    );
  });

  it('lässt keinen Kreis zu, auch nicht über Enkel', async () => {
    const a = await firmen.create(workspaceId, { name: 'A' });
    const b = await firmen.create(workspaceId, {
      name: 'B',
      parentCompanyId: a.id,
    });
    const c = await firmen.create(workspaceId, {
      name: 'C',
      parentCompanyId: b.id,
    });

    await expect(
      firmen.update(workspaceId, a.id, { parentCompanyId: c.id }),
    ).rejects.toThrow(/Kreis/u);
    await expect(
      firmen.update(workspaceId, a.id, { parentCompanyId: a.id }),
    ).rejects.toThrow(/eigene Muttergesellschaft/u);

    expect(
      (await firmen.update(workspaceId, c.id, { name: 'C neu' })).name,
    ).toBe('C neu');
  });

  it('nimmt keine Mutter aus einem anderen Bereich', async () => {
    const fremd = await dataSource
      .getRepository(WorkspaceEntity)
      .save({ name: 'Fremd', slug: 'fremd' });
    const fremdeFirma = await firmen.create(fremd.id, { name: 'Fremde' });

    await expect(
      firmen.create(workspaceId, {
        name: 'Tochter2',
        parentCompanyId: fremdeFirma.id,
      }),
    ).rejects.toThrow(/gibt es in diesem Arbeitsbereich nicht/u);
  });

  it('behält die Tochter, wenn die Mutter endgültig gelöscht wird', async () => {
    const mutter = await firmen.create(workspaceId, { name: 'Weg' });
    const tochter = await firmen.create(workspaceId, {
      name: 'Bleibt',
      parentCompanyId: mutter.id,
    });

    await dataSource.getRepository(CompanyEntity).delete(mutter.id);

    const danach = await dataSource
      .getRepository(CompanyEntity)
      .findOneByOrFail({ id: tochter.id });

    expect(danach.parentCompanyId).toBeNull();
  });
});

describe('Herkunft', () => {
  it('ist über einen Schlüssel immer die Schnittstelle', () => {
    expect(
      herkunftFuer({ apiKey: { id: 'k', name: 'n', permissions: [] } }, 'mail'),
    ).toBe('api');
    expect(herkunftFuer({}, 'mail')).toBe('mail');
    expect(herkunftFuer({}, 'import')).toBe('manuell');
    expect(herkunftFuer({}, undefined)).toBe('manuell');
  });

  it('lässt sich filtern; ohne Angabe gilt als leer', async () => {
    const neu = await dataSource.getRepository(WorkspaceEntity).save({
      name: 'Herkunft',
      slug: 'herkunft',
    });

    await firmen.create(neu.id, { name: 'Von Hand', herkunft: 'manuell' });
    await firmen.create(neu.id, { name: 'Eingelesen', herkunft: 'import' });
    await firmen.create(neu.id, { name: 'Alt' });

    const importiert = await firmen.list(neu.id, {
      customFilters: [
        { key: 'std:herkunft', operator: 'equals' as never, value: 'import' },
      ],
    });
    const unbekannt = await firmen.list(neu.id, {
      customFilters: [{ key: 'std:herkunft', operator: 'is_empty' as never }],
    });

    expect(importiert.items.map((f) => f.name)).toEqual(['Eingelesen']);
    expect(unbekannt.items.map((f) => f.name)).toEqual(['Alt']);
  });
});

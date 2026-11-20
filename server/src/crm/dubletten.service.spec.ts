import { type DataSource, In } from 'typeorm';

import { CustomFieldEntity } from '../custom-fields/custom-field.types';
import { FavoritEntity } from '../favoriten/favorit.entity';
import { InvoiceEntity } from '../invoices/invoice.entity';
import { SavedViewEntity } from '../saved-views/saved-view.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  VerteilerEntity,
  VerteilerMitgliedEntity,
} from '../verteiler/verteiler.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  DublettenService,
  firmenSchluessel,
  MAX_ZUSAMMENFUEHREN,
} from './dubletten.service';
import { CompanyEntity } from './entities/company.entity';
import { ContactEntity } from './entities/contact.entity';
import { DealEntity } from './entities/deal.entity';
import { NoteEntity } from './entities/note.entity';

const SUITE = 'dubletten';

jest.setTimeout(60_000);

let dataSource: DataSource;
let dubletten: DublettenService;
let workspaceId: string;
let fremd: string;
let anna: UserEntity;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  dubletten = new DublettenService(dataSource);

  const m = dataSource.manager;

  workspaceId = (
    await m.save(m.create(WorkspaceEntity, { name: 'Dub', slug: 'dub' }))
  ).id;
  fremd = (
    await m.save(
      m.create(WorkspaceEntity, { name: 'Fremd', slug: 'dub-fremd' }),
    )
  ).id;
  anna = await m.save(
    m.create(UserEntity, {
      email: 'anna@dub.test',
      passwordHash: 'x',
      firstName: 'Anna',
      lastName: 'Dub',
    }),
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

const firma = (
  name: string,
  extra: Partial<CompanyEntity> = {},
  bereich = workspaceId,
) =>
  dataSource.manager.save(
    dataSource.manager.create(CompanyEntity, {
      workspaceId: bereich,
      name,
      ...extra,
    }),
  );

describe('Dubletten', () => {
  it('erkennt Firmen trotz Rechtsform, Schreibweise und Domain', async () => {
    expect(firmenSchluessel('Müller GmbH & Co. KG')).toBe(
      firmenSchluessel('müller'),
    );

    const mueller = await firma('Müller GmbH', { domain: 'mueller.de' });

    await firma('Müller GmbH', {}, fremd);

    expect(
      (await dubletten.firmen(workspaceId, 'MÜLLER AG')).map((d) => d.id),
    ).toEqual([mueller.id]);
    expect(
      (
        await dubletten.firmen(
          workspaceId,
          'Ganz anders',
          'https://www.mueller.de/',
        )
      ).map((d) => d.id),
    ).toEqual([mueller.id]);
    expect(
      await dubletten.firmen(workspaceId, 'Müller', null, mueller.id),
    ).toEqual([]);
  });

  it('erkennt Kontakte an Adresse oder vollem Namen', async () => {
    const m = dataSource.manager;
    const erika = await m.save(
      m.create(ContactEntity, {
        workspaceId,
        firstName: 'Erika',
        lastName: 'Muster',
        email: 'Erika@Kunde.de',
      }),
    );

    expect(
      (await dubletten.kontakte(workspaceId, '', '', 'erika@kunde.de')).map(
        (d) => d.id,
      ),
    ).toEqual([erika.id]);
    expect(
      (await dubletten.kontakte(workspaceId, 'erika', 'MUSTER')).map(
        (d) => d.id,
      ),
    ).toEqual([erika.id]);
    expect(await dubletten.kontakte(workspaceId, 'Erika', '')).toEqual([]);
  });

  it('hängt beim Zusammenführen alles um, ergänzt Lücken und legt den anderen ab', async () => {
    const m = dataSource.manager;
    const behalten = await firma('Nord AG', {
      city: null,
      customFields: { a: 1 },
    });
    const weg = await firma('Nord Aktiengesellschaft', {
      city: 'Kiel',
      domain: 'nord.de',
      customFields: { a: 2, b: 3 },
    });
    const kontakt = await m.save(
      m.create(ContactEntity, {
        workspaceId,
        firstName: 'K',
        lastName: 'N',
        companyId: weg.id,
      }),
    );
    const deal = await m.save(
      m.create(DealEntity, { workspaceId, name: 'D', companyId: weg.id }),
    );
    const notiz = await m.save(
      m.create(NoteEntity, {
        workspaceId,
        body: 'x',
        companyId: weg.id,
        authorId: anna.id,
      }),
    );

    await dubletten.zusammenfuehren(
      workspaceId,
      'firma',
      behalten.id,
      weg.id,
      anna.id,
    );

    const neu = await m.findOneByOrFail(CompanyEntity, { id: behalten.id });

    expect(neu).toMatchObject({
      city: 'Kiel',
      domain: 'nord.de',
      customFields: { a: 1, b: 3 },
    });
    expect(
      (await m.findOneByOrFail(ContactEntity, { id: kontakt.id })).companyId,
    ).toBe(behalten.id);
    expect(
      (await m.findOneByOrFail(DealEntity, { id: deal.id })).companyId,
    ).toBe(behalten.id);
    expect(
      (await m.findOneByOrFail(NoteEntity, { id: notiz.id })).companyId,
    ).toBe(behalten.id);
    expect(await m.findOneBy(CompanyEntity, { id: weg.id })).toBeNull();
    expect(
      (
        await m.findOne(CompanyEntity, {
          where: { id: weg.id },
          withDeleted: true,
        })
      )?.deletedById,
    ).toBe(anna.id);
    expect(
      dataSource.entityMetadatas.some(
        (md) =>
          md.target === InvoiceEntity &&
          md.manyToOneRelations.some(
            (r) => r.inverseEntityMetadata.target === CompanyEntity,
          ),
      ),
    ).toBe(true);
  });

  it('weigert sich bei fremden Bereichen und bei sich selbst', async () => {
    const hier = await firma('Hier GmbH');
    const dort = await firma('Dort GmbH', {}, fremd);

    await expect(
      dubletten.zusammenfuehren(
        workspaceId,
        'firma',
        hier.id,
        dort.id,
        anna.id,
      ),
    ).rejects.toThrow('Alle Datensätze');
    await expect(
      dubletten.zusammenfuehren(
        workspaceId,
        'firma',
        hier.id,
        hier.id,
        anna.id,
      ),
    ).rejects.toThrow('sich selbst');
  });
});

describe('Zusammenführen von mehreren', () => {
  it('führt neun Firmen zu einer: Lücken in Reihenfolge, alles umgehängt', async () => {
    const m = dataSource.manager;
    const behalten = await firma('Süd GmbH', { customFields: { a: 1 } });
    const andere = [];

    for (let i = 1; i <= MAX_ZUSAMMENFUEHREN - 1; i++) {
      andere.push(
        await firma(`Süd ${i}`, {
          city: i >= 3 ? `Stadt ${i}` : null,
          customFields: { [`f${i}`]: i, a: 99 },
        }),
      );
    }

    for (const zeile of andere) {
      await m.save(
        m.create(NoteEntity, {
          workspaceId,
          body: zeile.name,
          companyId: zeile.id,
          authorId: anna.id,
        }),
      );
    }

    for (const id of [behalten.id, andere[0].id, andere[1].id]) {
      await m.save(
        m.create(FavoritEntity, {
          userId: anna.id,
          workspaceId,
          art: 'firma',
          datensatzId: id,
        }),
      );
    }

    const ansicht = await m.save(
      m.create(SavedViewEntity, {
        workspaceId,
        entity: CustomFieldEntity.CONTACT,
        name: 'Kontakte von Süd 4',
        createdById: anna.id,
        filters: { companyId: andere[3].id },
      }),
    );

    const wegIds = andere.map((zeile) => zeile.id);

    const vorschau = await dubletten.vorschau(
      workspaceId,
      'firma',
      behalten.id,
      wegIds,
    );

    expect(vorschau.felder).toContainEqual({
      feld: 'city',
      vonId: andere[2].id,
    });
    expect(vorschau.umgehaengt).toContainEqual({
      was: 'Notizen',
      anzahl: MAX_ZUSAMMENFUEHREN - 1,
    });
    expect(await m.countBy(CompanyEntity, { name: 'Süd 1' })).toBe(1);
    expect(await m.countBy(NoteEntity, { companyId: behalten.id })).toBe(0);

    const ergebnis = await dubletten.zusammenfuehrenMehrere(
      workspaceId,
      'firma',
      behalten.id,
      wegIds,
      anna.id,
    );

    expect(ergebnis).toEqual(vorschau);

    const neu = await m.findOneByOrFail(CompanyEntity, { id: behalten.id });

    expect(neu.city).toBe('Stadt 3');
    expect(neu.customFields).toMatchObject({ a: 1, f1: 1, f8: 8 });
    expect(await m.countBy(NoteEntity, { companyId: behalten.id })).toBe(
      MAX_ZUSAMMENFUEHREN - 1,
    );
    expect(await m.countBy(CompanyEntity, { id: In(wegIds) })).toBe(0);
    expect(
      await m.find(FavoritEntity, {
        where: { userId: anna.id, art: 'firma' },
      }),
    ).toEqual([expect.objectContaining({ datensatzId: behalten.id })]);
    expect(
      (await m.findOneByOrFail(SavedViewEntity, { id: ansicht.id })).filters,
    ).toEqual({ companyId: behalten.id });
  });

  it('nimmt nicht mehr als neun auf einmal', async () => {
    const behalten = await firma('Viele GmbH');
    const andere = [];

    for (let i = 0; i < MAX_ZUSAMMENFUEHREN; i++) {
      andere.push((await firma(`Viele ${i}`)).id);
    }

    await expect(
      dubletten.zusammenfuehrenMehrere(
        workspaceId,
        'firma',
        behalten.id,
        andere,
        anna.id,
      ),
    ).rejects.toThrow('höchstens');
    expect(
      await dataSource.manager.countBy(CompanyEntity, { id: In(andere) }),
    ).toBe(MAX_ZUSAMMENFUEHREN);
  });

  it('vereint bei Kontakten alle Adressen und Nummern', async () => {
    const m = dataSource.manager;
    const kontakt = (email: string | null, phone: string | null) =>
      m.save(
        m.create(ContactEntity, {
          workspaceId,
          firstName: 'Eva',
          lastName: 'Ost',
          email,
          phone,
        }),
      );
    const behalten = await kontakt('eva@ost.de', null);
    const zwei = await kontakt('eva.ost@privat.de', '+49301234');
    const drei = await kontakt('e.ost@firma.de', '+49305678');

    await dubletten.zusammenfuehrenMehrere(
      workspaceId,
      'kontakt',
      behalten.id,
      [zwei.id, drei.id],
      anna.id,
    );

    const neu = await m.findOneByOrFail(ContactEntity, { id: behalten.id });

    expect(neu.email).toBe('eva@ost.de');
    expect(neu.phone).toBe('+49301234');
    expect(neu.weitereEmails.map((e) => e.wert).sort()).toEqual([
      'e.ost@firma.de',
      'eva.ost@privat.de',
    ]);
    expect(neu.weitereTelefone.map((t) => t.wert)).toEqual(['+49305678']);
  });

  it('bricht ganz ab, wenn einer der anderen fehlt', async () => {
    const behalten = await firma('Ganz GmbH');
    const da = await firma('Ganz 1');
    const fremde = await firma('Ganz 2', {}, fremd);

    await expect(
      dubletten.zusammenfuehrenMehrere(
        workspaceId,
        'firma',
        behalten.id,
        [da.id, fremde.id],
        anna.id,
      ),
    ).rejects.toThrow('Alle Datensätze');
    expect(await dataSource.manager.countBy(CompanyEntity, { id: da.id })).toBe(
      1,
    );
  });
});

describe('Zusammenführen von Kontakten in Verteilern', () => {
  const m = () => dataSource.manager;
  const kontakt = (vorname: string) =>
    m().save(
      m().create(ContactEntity, {
        workspaceId,
        firstName: vorname,
        lastName: 'Verteiler',
      }),
    );
  const verteiler = (name: string) =>
    m().save(m().create(VerteilerEntity, { workspaceId, name }));
  const aufnehmen = (verteilerId: string, contactId: string) =>
    m().insert(VerteilerMitgliedEntity, {
      verteilerId,
      contactId,
      workspaceId,
    });
  const mitglieder = async (verteilerId: string) =>
    (await m().findBy(VerteilerMitgliedEntity, { verteilerId })).map(
      (z) => z.contactId,
    );

  it('lässt genau eine Mitgliedschaft, wenn beide im selben Verteiler stehen', async () => {
    const v = await verteiler('Newsletter');
    const behalten = await kontakt('Bea');
    const doppelt = await kontakt('Bea2');

    await aufnehmen(v.id, behalten.id);
    await aufnehmen(v.id, doppelt.id);

    const ergebnis = await dubletten.zusammenfuehrenMehrere(
      workspaceId,
      'kontakt',
      behalten.id,
      [doppelt.id],
      anna.id,
    );

    expect(await mitglieder(v.id)).toEqual([behalten.id]);
    expect(ergebnis.umgehaengt).not.toContainEqual(
      expect.objectContaining({ was: 'Verteiler' }),
    );
  });

  it('macht aus zwei wegfallenden im selben Verteiler eine Mitgliedschaft', async () => {
    const v = await verteiler('Messe');
    const behalten = await kontakt('Carl');
    const zwei = await kontakt('Carl2');
    const drei = await kontakt('Carl3');

    await aufnehmen(v.id, zwei.id);
    await aufnehmen(v.id, drei.id);

    const ergebnis = await dubletten.zusammenfuehrenMehrere(
      workspaceId,
      'kontakt',
      behalten.id,
      [zwei.id, drei.id],
      anna.id,
    );

    expect(await mitglieder(v.id)).toEqual([behalten.id]);
    expect(ergebnis.umgehaengt).toContainEqual({ was: 'Verteiler', anzahl: 1 });
  });

  it('hängt eine Mitgliedschaft nur des wegfallenden um', async () => {
    const v = await verteiler('Kunden');
    const behalten = await kontakt('Dora');
    const doppelt = await kontakt('Dora2');

    await aufnehmen(v.id, doppelt.id);

    await dubletten.zusammenfuehrenMehrere(
      workspaceId,
      'kontakt',
      behalten.id,
      [doppelt.id],
      anna.id,
    );

    expect(await mitglieder(v.id)).toEqual([behalten.id]);
  });
});

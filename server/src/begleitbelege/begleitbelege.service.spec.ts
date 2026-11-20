import { BadRequestException, NotFoundException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { AttachmentEntity } from '../attachments/attachment.entity';
import { AttachmentsService } from '../attachments/attachments.service';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { LetterheadEntity } from '../quotes/letterhead.entity';
import { LetterheadsService } from '../quotes/letterheads.service';
import { quoteTotals } from '../quotes/quote-totals';
import { QuoteEntity } from '../quotes/quote.entity';
import { type QuoteLineInput, QuotesService } from '../quotes/quotes.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { hoereAuf, type Meldung } from '../webhooks/ereignisse';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { BegleitbelegEntity } from './begleitbeleg.entity';
import { BegleitbelegArt, BegleitbelegStatus } from './begleitbeleg.types';
import { BegleitbelegeService } from './begleitbelege.service';

const SUITE = 'begleitbelege';

jest.setTimeout(60_000);

let dataSource: DataSource;
let quotes: QuotesService;
let letterheads: LetterheadsService;
let service: BegleitbelegeService;
let workspaceId: string;
let companyId: string;
let meldungen: Meldung[] = [];

const belegMeldungen = (): string[] =>
  meldungen
    .map((m) => m.event)
    .filter((event) => /^(order_confirmation|delivery_note)\./u.test(event));
let abmelden: () => void;

const jahr = String(new Date().getFullYear());

const zeile = (over: Partial<QuoteLineInput> = {}): QuoteLineInput => ({
  name: 'Palette Schrauben',
  quantity: 10,
  unit: 'Stück',
  unitPriceCents: 1250,
  taxRatePercent: 19,
  ...over,
});

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  letterheads = new LetterheadsService(
    dataSource.getRepository(LetterheadEntity),
  );
  quotes = new QuotesService(
    dataSource.getRepository(QuoteEntity),
    dataSource,
    letterheads,
  );
  service = new BegleitbelegeService(
    dataSource.getRepository(BegleitbelegEntity),
    dataSource,
    quotes,
    letterheads,
    new AttachmentsService(
      dataSource.getRepository(AttachmentEntity),
      dataSource,
    ),
  );
  abmelden = hoereAuf((meldung) => meldungen.push(meldung));
});

afterAll(async () => {
  abmelden();
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE workspaces, begleitbeleg_zaehler CASCADE',
  );
  meldungen = [];

  const workspaces = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Unsere', slug: 'unsere' }))
  ).id;
  companyId = (
    await dataSource.getRepository(CompanyEntity).save(
      dataSource.getRepository(CompanyEntity).create({
        workspaceId,
        name: 'Nordwind GmbH',
        street: 'Hafenstraße 12',
        postalCode: '20457',
        city: 'Hamburg',
      }),
    )
  ).id;

  await letterheads.update(workspaceId, {
    companyName: 'Stegwerk Test GmbH',
    city: 'Berlin',
  } as never);
});

const versandt = async (zeilen: QuoteLineInput[] = [zeile()]) => {
  const angebot = await quotes.create(workspaceId, { companyId });

  await quotes.setLines(workspaceId, angebot.id, zeilen);

  return quotes.markSent(workspaceId, angebot.id);
};

describe('die Auftragsbestätigung', () => {
  it('gibt es nicht zu einem Entwurf', async () => {
    const entwurf = await quotes.create(workspaceId, { companyId });

    await quotes.setLines(workspaceId, entwurf.id, [zeile()]);

    await expect(
      service.auftragsbestaetigungStellen(workspaceId, null, {
        angebotId: entwurf.id,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('übernimmt Positionen, Anschrift und Nummer, und meldet sich', async () => {
    const angebot = await versandt([
      zeile(),
      zeile({
        name: 'Montage',
        quantity: 2,
        unit: 'Stunde',
        unitPriceCents: 6000,
      }),
    ]);

    const ab = await service.auftragsbestaetigungStellen(workspaceId, null, {
      angebotId: angebot.id,
      liefertermin: '2026-12-01',
    });

    expect(ab.number).toBe(`AB-${jahr}-0001`);
    expect(ab.art).toBe(BegleitbelegArt.AUFTRAGSBESTAETIGUNG);
    expect(ab.positionen.map((p) => p.name)).toEqual([
      'Palette Schrauben',
      'Montage',
    ]);
    expect(ab.recipientAddress).toContain('Nordwind GmbH');
    expect(ab.introText).toContain(`zu unserem Angebot ${angebot.number}`);
    expect(ab.liefertermin).toBe('2026-12-01');
    expect(belegMeldungen()).toEqual(['order_confirmation.issued']);
  });

  it('friert den Absender ein', async () => {
    const angebot = await versandt();
    const ab = await service.auftragsbestaetigungStellen(workspaceId, null, {
      angebotId: angebot.id,
    });

    await letterheads.update(workspaceId, {
      companyName: 'Umbenannt AG',
    } as never);

    const gelesen = await service.findOne(workspaceId, ab.id);

    expect(gelesen.issuerSnapshot?.companyName).toBe('Stegwerk Test GmbH');
  });

  it('gibt es je Angebot nur einmal, bis sie storniert ist', async () => {
    const angebot = await versandt();

    const erste = await service.auftragsbestaetigungStellen(workspaceId, null, {
      angebotId: angebot.id,
    });

    await expect(
      service.auftragsbestaetigungStellen(workspaceId, null, {
        angebotId: angebot.id,
      }),
    ).rejects.toThrow(/schon die Auftragsbestätigung/u);

    const storno = await service.stornieren(
      workspaceId,
      null,
      erste.id,
      'Menge geändert',
    );

    expect(storno.number).toBe(`AB-${jahr}-0002`);
    expect(storno.stornoVonId).toBe(erste.id);
    expect(storno.introText).toContain(
      `stornieren wir die Auftragsbestätigung ${erste.number}`,
    );
    expect((await service.findOne(workspaceId, erste.id)).status).toBe(
      BegleitbelegStatus.STORNIERT,
    );

    const neue = await service.auftragsbestaetigungStellen(workspaceId, null, {
      angebotId: angebot.id,
    });

    expect(neue.number).toBe(`AB-${jahr}-0003`);
  });

  it('lädt am Storno das Original und das Angebot samt Zeilen', async () => {
    const angebot = await versandt([
      zeile(),
      zeile({ name: 'Montage', unitPriceCents: 6000 }),
    ]);
    const ab = await service.auftragsbestaetigungStellen(workspaceId, null, {
      angebotId: angebot.id,
    });
    const storno = await service.stornieren(workspaceId, null, ab.id);

    const gelesen = await service.findOne(workspaceId, storno.id);

    expect(gelesen.stornoVon?.positionen.map((p) => p.name)).toEqual([
      'Palette Schrauben',
      'Montage',
    ]);
    expect(
      quoteTotals(gelesen.stornoVon?.positionen ?? [], false).grossCents,
    ).toBeGreaterThan(0);
    expect(gelesen.angebot.lines.map((l) => l.name)).toEqual([
      'Palette Schrauben',
      'Montage',
    ]);
  });

  it('nimmt einen langen Kontaktnamen auf', async () => {
    const contacts = dataSource.getRepository(ContactEntity);
    const kontakt = await contacts.save(
      contacts.create({
        workspaceId,
        firstName: 'V'.repeat(100),
        lastName: 'N'.repeat(100),
      }),
    );
    const angebot = await quotes.create(workspaceId, {
      companyId,
      contactId: kontakt.id,
    });

    await quotes.setLines(workspaceId, angebot.id, [zeile()]);
    await quotes.markSent(workspaceId, angebot.id);

    const ab = await service.auftragsbestaetigungStellen(workspaceId, null, {
      angebotId: angebot.id,
    });

    expect(ab.kontaktName).toHaveLength(200);
  });

  it('lässt sich nur einmal stornieren, und den Storno gar nicht', async () => {
    const angebot = await versandt();
    const ab = await service.auftragsbestaetigungStellen(workspaceId, null, {
      angebotId: angebot.id,
    });
    const storno = await service.stornieren(workspaceId, null, ab.id);

    await expect(service.stornieren(workspaceId, null, ab.id)).rejects.toThrow(
      /bereits storniert/u,
    );
    await expect(
      service.stornieren(workspaceId, null, storno.id),
    ).rejects.toThrow(/Stornobeleg/u);
  });

  it('hält das Angebot darunter fest', async () => {
    const angebot = await versandt();

    await service.auftragsbestaetigungStellen(workspaceId, null, {
      angebotId: angebot.id,
    });

    await expect(
      dataSource.query('DELETE FROM quotes WHERE id = $1', [angebot.id]),
    ).rejects.toThrow();
  });
});

describe('der Lieferschein', () => {
  it('liefert nie mehr, als offen ist, und hält den Rest fest', async () => {
    const angebot = await versandt([zeile({ quantity: 10 })]);
    const positionId = angebot.lines[0].id;

    await expect(
      service.lieferscheinStellen(workspaceId, null, {
        angebotId: angebot.id,
        positionen: [{ angebotsPositionId: positionId, menge: 11 }],
      }),
    ).rejects.toThrow(/nur noch 10 Stück offen/u);

    const erster = await service.lieferscheinStellen(workspaceId, null, {
      angebotId: angebot.id,
      lieferadresse: 'Baustelle Nord\nKai 4\n20457 Hamburg',
      positionen: [{ angebotsPositionId: positionId, menge: 4 }],
    });

    expect(erster.number).toBe(`LS-${jahr}-0001`);
    expect(erster.positionen[0].quantity).toBe(4);
    expect(erster.positionen[0].restOffen).toBe(6);
    expect(erster.lieferadresse).toContain('Baustelle Nord');

    const stand = await service.lieferstand(workspaceId, angebot.id);

    expect(stand[0]).toMatchObject({ bestellt: 10, geliefert: 4, offen: 6 });

    const zweiter = await service.lieferscheinStellen(workspaceId, null, {
      angebotId: angebot.id,
      positionen: [{ angebotsPositionId: positionId, menge: 6 }],
    });

    expect(zweiter.positionen[0].restOffen).toBe(0);
    expect(
      (await service.findOne(workspaceId, erster.id)).positionen[0].restOffen,
    ).toBe(6);

    await expect(
      service.lieferscheinStellen(workspaceId, null, {
        angebotId: angebot.id,
        positionen: [{ angebotsPositionId: positionId, menge: 0.001 }],
      }),
    ).rejects.toThrow(/nur noch 0 Stück offen/u);
  });

  it('rechnet Bruchteile ohne Rundungsrest', async () => {
    const angebot = await versandt([
      zeile({ quantity: 0.3, unit: 'Stunde', name: 'Einweisung' }),
    ]);
    const positionId = angebot.lines[0].id;

    await service.lieferscheinStellen(workspaceId, null, {
      angebotId: angebot.id,
      positionen: [{ angebotsPositionId: positionId, menge: 0.1 }],
    });
    await service.lieferscheinStellen(workspaceId, null, {
      angebotId: angebot.id,
      positionen: [{ angebotsPositionId: positionId, menge: 0.2 }],
    });

    expect((await service.lieferstand(workspaceId, angebot.id))[0].offen).toBe(
      0,
    );
  });

  it('gibt nach dem Storno die Menge wieder frei', async () => {
    const angebot = await versandt([zeile({ quantity: 5 })]);
    const positionId = angebot.lines[0].id;
    const ls = await service.lieferscheinStellen(workspaceId, null, {
      angebotId: angebot.id,
      positionen: [{ angebotsPositionId: positionId, menge: 5 }],
    });

    const storno = await service.stornieren(workspaceId, null, ls.id);

    expect(storno.number).toBe(`LS-${jahr}-0002`);
    expect((await service.lieferstand(workspaceId, angebot.id))[0].offen).toBe(
      5,
    );
    expect(belegMeldungen()).toEqual([
      'delivery_note.issued',
      'delivery_note.cancelled',
    ]);
  });

  it('folgt nur einer gültigen Auftragsbestätigung desselben Angebots', async () => {
    const angebot = await versandt();
    const anderes = await versandt();
    const abAnderes = await service.auftragsbestaetigungStellen(
      workspaceId,
      null,
      { angebotId: anderes.id },
    );

    await expect(
      service.lieferscheinStellen(workspaceId, null, {
        angebotId: angebot.id,
        auftragsbestaetigungId: abAnderes.id,
        positionen: [{ angebotsPositionId: angebot.lines[0].id, menge: 1 }],
      }),
    ).rejects.toThrow(/gültigen Auftragsbestätigung/u);
  });

  it('sperrt den Storno der Auftragsbestätigung, solange Lieferscheine gelten', async () => {
    const angebot = await versandt();
    const ab = await service.auftragsbestaetigungStellen(workspaceId, null, {
      angebotId: angebot.id,
    });
    const ls = await service.lieferscheinStellen(workspaceId, null, {
      angebotId: angebot.id,
      auftragsbestaetigungId: ab.id,
      positionen: [{ angebotsPositionId: angebot.lines[0].id, menge: 2 }],
    });

    expect(ls.introText).toContain(`Auftragsbestätigung ${ab.number}`);

    await expect(service.stornieren(workspaceId, null, ab.id)).rejects.toThrow(
      new RegExp(ls.number, 'u'),
    );

    await service.stornieren(workspaceId, null, ls.id);
    await expect(
      service.stornieren(workspaceId, null, ab.id),
    ).resolves.toMatchObject({ stornoVonId: ab.id });
  });

  it('übernimmt die Nummer der Angebotszeile', async () => {
    const angebot = await versandt([
      zeile(),
      zeile({ name: 'Montage' }),
      zeile({ name: 'Schrank' }),
    ]);
    const ls = await service.lieferscheinStellen(workspaceId, null, {
      angebotId: angebot.id,
      positionen: [{ angebotsPositionId: angebot.lines[2].id, menge: 1 }],
    });

    expect(ls.positionen.map((p) => [p.name, p.position])).toEqual([
      ['Schrank', angebot.lines[2].position],
    ]);
    expect(ls.positionen[0].position).toBe(2);
  });

  it('verweist nie auf eine gleichzeitig stornierte Auftragsbestätigung', async () => {
    const angebot = await versandt();
    const ab = await service.auftragsbestaetigungStellen(workspaceId, null, {
      angebotId: angebot.id,
    });

    const storno = dataSource.createQueryRunner();

    await storno.connect();
    await storno.startTransaction();
    await storno.query(
      `SELECT "status" FROM "begleitbelege" WHERE "id" = $1 FOR UPDATE`,
      [ab.id],
    );
    await storno.query(
      `UPDATE "begleitbelege" SET "status" = 'storniert' WHERE "id" = $1`,
      [ab.id],
    );

    const lieferschein = service.lieferscheinStellen(workspaceId, null, {
      angebotId: angebot.id,
      auftragsbestaetigungId: ab.id,
      positionen: [{ angebotsPositionId: angebot.lines[0].id, menge: 1 }],
    });
    const ergebnis = lieferschein.then(
      () => 'gestellt',
      (fehler: Error) => fehler.message,
    );

    await new Promise((fertig) => setTimeout(fertig, 500));
    await storno.commitTransaction();
    await storno.release();

    expect(await ergebnis).toMatch(/gültigen Auftragsbestätigung/u);
  });

  it('lässt bei zwei gleichzeitigen Lieferscheinen nur einen durch', async () => {
    const angebot = await versandt([zeile({ quantity: 3 })]);
    const positionId = angebot.lines[0].id;
    const stellen = () =>
      service.lieferscheinStellen(workspaceId, null, {
        angebotId: angebot.id,
        positionen: [{ angebotsPositionId: positionId, menge: 3 }],
      });

    const ergebnisse = await Promise.allSettled([stellen(), stellen()]);

    expect(ergebnisse.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    expect((await service.lieferstand(workspaceId, angebot.id))[0].offen).toBe(
      0,
    );
  });
});

describe('Zugriff und Ablage', () => {
  it('kennt Belege eines anderen Bereichs nicht', async () => {
    const angebot = await versandt();
    const ab = await service.auftragsbestaetigungStellen(workspaceId, null, {
      angebotId: angebot.id,
    });
    const fremd = (
      await dataSource
        .getRepository(WorkspaceEntity)
        .save(
          dataSource
            .getRepository(WorkspaceEntity)
            .create({ name: 'Fremde', slug: 'fremde' }),
        )
    ).id;

    await expect(service.findOne(fremd, ab.id)).rejects.toThrow(
      NotFoundException,
    );
    expect(await service.list(fremd)).toEqual([]);
  });

  it('filtert nach Angebot, Art und Firma', async () => {
    const angebot = await versandt();

    await service.auftragsbestaetigungStellen(workspaceId, null, {
      angebotId: angebot.id,
    });
    await service.lieferscheinStellen(workspaceId, null, {
      angebotId: angebot.id,
      positionen: [{ angebotsPositionId: angebot.lines[0].id, menge: 1 }],
    });

    expect(
      (
        await service.list(workspaceId, { art: BegleitbelegArt.LIEFERSCHEIN })
      ).map((b) => b.number),
    ).toEqual([`LS-${jahr}-0001`]);
    expect(await service.list(workspaceId, { companyId })).toHaveLength(2);
    expect(
      await service.list(workspaceId, { angebotId: angebot.id }),
    ).toHaveLength(2);
  });

  it('legt das PDF als Datei ans Angebot', async () => {
    const angebot = await versandt();
    const ab = await service.auftragsbestaetigungStellen(workspaceId, null, {
      angebotId: angebot.id,
    });
    const nutzer = await dataSource.query<{ id: string }[]>(
      `INSERT INTO users (email, "passwordHash", "firstName", "lastName")
       VALUES ('anhang@example.test', 'x', 'An', 'Hang') RETURNING id`,
    );

    const anhang = await service.alsAnhang(workspaceId, nutzer[0].id, ab.id);

    expect(anhang.quoteId).toBe(angebot.id);
    expect(anhang.name).toBe(`Auftragsbestaetigung-AB-${jahr}-0001.pdf`);
    expect(anhang.sizeBytes).toBeGreaterThan(1000);
  });

  it('verschwindet mit dem Arbeitsbereich', async () => {
    const angebot = await versandt();
    const ab = await service.auftragsbestaetigungStellen(workspaceId, null, {
      angebotId: angebot.id,
    });

    await service.lieferscheinStellen(workspaceId, null, {
      angebotId: angebot.id,
      auftragsbestaetigungId: ab.id,
      positionen: [{ angebotsPositionId: angebot.lines[0].id, menge: 1 }],
    });
    await service.stornieren(
      workspaceId,
      null,
      (
        await service.list(workspaceId, { art: BegleitbelegArt.LIEFERSCHEIN })
      )[0].id,
    );

    await dataSource.getRepository(WorkspaceEntity).delete({ id: workspaceId });

    const rest = await dataSource.query<{ n: string }[]>(
      'SELECT count(*) AS n FROM begleitbelege',
    );

    expect(Number(rest[0].n)).toBe(0);
  });
});

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, IsNull, Repository } from 'typeorm';

import { AttachmentsService } from '../attachments/attachments.service';
import { type AttachmentEntity } from '../attachments/attachment.entity';
import { berlinDate } from '../calendar/berlin-time';
import { absenderKopie, briefkopfFuer } from '../invoices/absender';
import { LetterheadsService } from '../quotes/letterheads.service';
import { type QuoteEntity } from '../quotes/quote.entity';
import { QuoteStatus } from '../quotes/quote.types';
import { QuotesService } from '../quotes/quotes.service';
import { befreiungVon } from '../quotes/steuerbefreiung';
import { melde } from '../webhooks/ereignisse';
import {
  nurSichtbareZeilen,
  zielSichtbar,
} from '../workspaces/ziel-sichtbarkeit';
import { formatBelegNummer } from './begleitbeleg-nummern';
import { renderBegleitbelegPdf, standardEinleitung } from './begleitbeleg-pdf';
import {
  type BearbeiterKopie,
  BegleitbelegEntity,
  BegleitbelegPositionEntity,
} from './begleitbeleg.entity';
import {
  ART_TEXT,
  BegleitbelegArt,
  BegleitbelegStatus,
} from './begleitbeleg.types';
import {
  lieferFehler,
  lieferstand,
  type LieferstandZeile,
  tausendstel,
} from './lieferstand';

export type BelegFilter = {
  angebotId?: string | null;
  dealId?: string | null;
  companyId?: string | null;
  art?: BegleitbelegArt | null;
};

const ZULAESSIG = [QuoteStatus.SENT, QuoteStatus.ACCEPTED];

@Injectable()
export class BegleitbelegeService {
  constructor(
    @InjectRepository(BegleitbelegEntity)
    private readonly belege: Repository<BegleitbelegEntity>,
    private readonly dataSource: DataSource,
    private readonly quotes: QuotesService,
    private readonly letterheads: LetterheadsService,
    private readonly attachments: AttachmentsService,
  ) {}

  private relations() {
    return {
      angebot: { lines: true },
      auftragsbestaetigung: { positionen: true },
      stornoVon: { positionen: true },
      positionen: true,
      company: true,
      contact: true,
      deal: true,
    };
  }

  async list(
    workspaceId: string,
    filter: BelegFilter = {},
  ): Promise<BegleitbelegEntity[]> {
    const zeilen = await this.belege.find({
      where: {
        workspaceId,
        ...(filter.angebotId ? { angebotId: filter.angebotId } : {}),
        ...(filter.dealId ? { dealId: filter.dealId } : {}),
        ...(filter.companyId ? { companyId: filter.companyId } : {}),
        ...(filter.art ? { art: filter.art } : {}),
      },
      relations: this.relations(),
      order: { createdAt: 'DESC' },
      take: 500,
    });

    for (const zeile of zeilen) {
      this.ordne(zeile);
    }

    return nurSichtbareZeilen(
      this.belege.manager,
      'begleitbelege',
      zeilen,
      'bearbeiterId',
    );
  }

  async findOne(workspaceId: string, id: string): Promise<BegleitbelegEntity> {
    const beleg = await this.belege.findOne({
      where: { id, workspaceId },
      relations: this.relations(),
    });

    if (
      beleg === null ||
      !(await zielSichtbar(this.belege.manager, beleg, beleg.bearbeiterId))
    ) {
      throw new NotFoundException('Diesen Beleg gibt es nicht.');
    }

    this.ordne(beleg);

    return beleg;
  }

  private ordne(beleg: BegleitbelegEntity): void {
    beleg.positionen.sort((a, b) => a.position - b.position);
    beleg.angebot.lines.sort((a, b) => a.position - b.position);
    beleg.auftragsbestaetigung?.positionen.sort(
      (a, b) => a.position - b.position,
    );
    beleg.stornoVon?.positionen.sort((a, b) => a.position - b.position);
  }

  async lieferstand(
    workspaceId: string,
    angebotId: string,
  ): Promise<LieferstandZeile[]> {
    const angebot = await this.quotes.findOne(workspaceId, angebotId);

    return this.standIn(this.dataSource.manager, workspaceId, angebot);
  }

  private async standIn(
    manager: EntityManager,
    workspaceId: string,
    angebot: QuoteEntity,
  ): Promise<LieferstandZeile[]> {
    const geliefert = await manager.query<
      { angebotsPositionId: string; quantity: string }[]
    >(
      `SELECT p."angebotsPositionId", p."quantity"
         FROM "begleitbeleg_positionen" p
         JOIN "begleitbelege" b ON b."id" = p."belegId"
        WHERE b."workspaceId" = $1 AND b."angebotId" = $2
          AND b."art" = 'lieferschein' AND b."status" = 'gestellt'
          AND b."stornoVonId" IS NULL
          AND p."angebotsPositionId" IS NOT NULL`,
      [workspaceId, angebot.id],
    );

    return lieferstand(
      angebot.lines.map((zeile) => ({
        id: zeile.id,
        position: zeile.position,
        name: zeile.name,
        articleNumber: zeile.articleNumber,
        description: zeile.description,
        quantity: Number(zeile.quantity),
        unit: zeile.unit,
      })),
      geliefert.map((eintrag) => ({
        angebotsPositionId: eintrag.angebotsPositionId,
        quantity: Number(eintrag.quantity),
      })),
    );
  }

  private async angebotFuer(
    workspaceId: string,
    angebotId: string,
  ): Promise<QuoteEntity> {
    const angebot = await this.quotes.findOne(workspaceId, angebotId);

    if (!ZULAESSIG.includes(angebot.status)) {
      throw new BadRequestException(
        'Auftragsbestätigung und Lieferschein gibt es nur zu einem versandten oder angenommenen Angebot.',
      );
    }

    if (angebot.lines.length === 0) {
      throw new BadRequestException('Das Angebot hat keine Positionen.');
    }

    return angebot;
  }

  private async naechsteNummer(
    manager: EntityManager,
    workspaceId: string,
    art: BegleitbelegArt,
    heute: string,
  ): Promise<string> {
    const jahr = Number(heute.slice(0, 4));

    await manager.query(
      `INSERT INTO "begleitbeleg_zaehler" ("workspaceId", "art", "year", "lastSequence")
       VALUES ($1, $2, $3, 0)
       ON CONFLICT ("workspaceId", "art", "year") DO NOTHING`,
      [workspaceId, art, jahr],
    );

    const gesperrt = await manager.query<{ lastSequence: number }[]>(
      `SELECT "lastSequence" FROM "begleitbeleg_zaehler"
        WHERE "workspaceId" = $1 AND "art" = $2 AND "year" = $3
        FOR UPDATE`,
      [workspaceId, art, jahr],
    );
    const naechste = Number(gesperrt[0]?.lastSequence ?? 0) + 1;

    await manager.query(
      `UPDATE "begleitbeleg_zaehler" SET "lastSequence" = $4
        WHERE "workspaceId" = $1 AND "art" = $2 AND "year" = $3`,
      [workspaceId, art, jahr, naechste],
    );

    return formatBelegNummer(art, jahr, naechste);
  }

  private async sperreAngebot(
    manager: EntityManager,
    angebotId: string,
  ): Promise<void> {
    await manager.query(
      `SELECT "id" FROM "quotes" WHERE "id" = $1 FOR UPDATE`,
      [angebotId],
    );
  }

  private bearbeiterKopie(angebot: QuoteEntity): BearbeiterKopie | null {
    const person = angebot.bearbeiter;

    if (person === null || person.email.endsWith('@stegwerk.invalid')) {
      return null;
    }

    return {
      name: `${person.firstName} ${person.lastName}`.trim(),
      funktion: person.funktion,
      durchwahl: person.durchwahl,
      email: person.email,
    };
  }

  private async kopfVom(
    workspaceId: string,
    angebot: QuoteEntity,
  ): Promise<Partial<BegleitbelegEntity>> {
    const briefkopf = await this.letterheads.get(workspaceId);

    return {
      workspaceId,
      angebotId: angebot.id,
      companyId: angebot.companyId,
      contactId: angebot.contactId,
      dealId: angebot.dealId,
      bearbeiterId: angebot.bearbeiterId,
      recipientAddress: angebot.recipientAddress,
      currency: angebot.currency,
      smallBusiness: angebot.smallBusiness,
      ...befreiungVon(angebot),
      issuerSnapshot: absenderKopie(briefkopf),
      kontaktName:
        angebot.contact === null
          ? null
          : `${angebot.contact.firstName} ${angebot.contact.lastName}`
              .trim()
              .slice(0, 200),
      bearbeiterSnapshot: this.bearbeiterKopie(angebot),
    };
  }

  private text(wert: string | null | undefined): string | null {
    const sauber = wert?.trim() ?? '';

    return sauber === '' ? null : sauber;
  }

  async auftragsbestaetigungStellen(
    workspaceId: string,
    userId: string | null,
    input: {
      angebotId: string;
      liefertermin?: string | null;
      introText?: string | null;
      closingText?: string | null;
    },
  ): Promise<BegleitbelegEntity> {
    const angebot = await this.angebotFuer(workspaceId, input.angebotId);
    const heute = berlinDate(new Date());
    const kopf = await this.kopfVom(workspaceId, angebot);

    let id: string;

    try {
      id = await this.dataSource.transaction(async (manager) => {
        await this.sperreAngebot(manager, angebot.id);

        const vorhanden = await manager.findOne(BegleitbelegEntity, {
          where: {
            workspaceId,
            angebotId: angebot.id,
            art: BegleitbelegArt.AUFTRAGSBESTAETIGUNG,
            status: BegleitbelegStatus.GESTELLT,
            stornoVonId: IsNull(),
          },
          select: { id: true, number: true },
        });

        if (vorhanden !== null) {
          throw new BadRequestException(
            `Zu diesem Angebot gibt es schon die Auftragsbestätigung ${vorhanden.number}. Stornieren Sie sie, um eine neue zu stellen.`,
          );
        }

        const number = await this.naechsteNummer(
          manager,
          workspaceId,
          BegleitbelegArt.AUFTRAGSBESTAETIGUNG,
          heute,
        );
        const liefertermin = input.liefertermin ?? null;
        const beleg = await manager.save(
          manager.create(BegleitbelegEntity, {
            ...kopf,
            art: BegleitbelegArt.AUFTRAGSBESTAETIGUNG,
            number,
            status: BegleitbelegStatus.GESTELLT,
            createdById: userId,
            issuedOn: heute,
            liefertermin,
            introText:
              this.text(input.introText) ??
              standardEinleitung({
                art: BegleitbelegArt.AUFTRAGSBESTAETIGUNG,
                angebot: { number: angebot.number, issuedOn: angebot.issuedOn },
              }),
            closingText: this.text(input.closingText),
          }),
        );

        await manager.save(
          angebot.lines.map((zeile, index) =>
            manager.create(BegleitbelegPositionEntity, {
              belegId: beleg.id,
              angebotsPositionId: zeile.id,
              position: index,
              name: zeile.name,
              articleNumber: zeile.articleNumber,
              description: zeile.description,
              quantity: Number(zeile.quantity),
              unit: zeile.unit,
              unitPriceCents: zeile.unitPriceCents,
              discountPercent: Number(zeile.discountPercent),
              taxRatePercent: zeile.taxRatePercent,
            }),
          ),
        );

        return beleg.id;
      });
    } catch (fehler) {
      if ((fehler as { code?: string }).code === '23505') {
        throw new BadRequestException(
          'Zu diesem Angebot wurde eben schon eine Auftragsbestätigung gestellt.',
        );
      }

      throw fehler;
    }

    const beleg = await this.findOne(workspaceId, id);

    melde({
      workspaceId,
      event: 'order_confirmation.issued',
      data: this.meldung(beleg),
    });

    return beleg;
  }

  async lieferscheinStellen(
    workspaceId: string,
    userId: string | null,
    input: {
      angebotId: string;
      auftragsbestaetigungId?: string | null;
      lieferadresse?: string | null;
      liefertermin?: string | null;
      introText?: string | null;
      closingText?: string | null;
      positionen: { angebotsPositionId: string; menge: number }[];
    },
  ): Promise<BegleitbelegEntity> {
    const angebot = await this.angebotFuer(workspaceId, input.angebotId);
    let ab: BegleitbelegEntity | null = null;

    if (input.auftragsbestaetigungId) {
      ab = await this.findOne(workspaceId, input.auftragsbestaetigungId);

      if (
        ab.art !== BegleitbelegArt.AUFTRAGSBESTAETIGUNG ||
        ab.angebotId !== angebot.id ||
        ab.stornoVonId !== null ||
        ab.status !== BegleitbelegStatus.GESTELLT
      ) {
        throw new BadRequestException(
          'Ein Lieferschein folgt nur einer gültigen Auftragsbestätigung zu demselben Angebot.',
        );
      }
    }

    const heute = berlinDate(new Date());
    const kopf = await this.kopfVom(workspaceId, angebot);

    const id = await this.dataSource.transaction(async (manager) => {
      await this.sperreAngebot(manager, angebot.id);

      if (ab !== null) {
        const jetzt = await manager.query<{ status: string }[]>(
          `SELECT "status" FROM "begleitbelege" WHERE "id" = $1 FOR UPDATE`,
          [ab.id],
        );

        if (jetzt[0]?.status !== BegleitbelegStatus.GESTELLT) {
          throw new BadRequestException(
            'Ein Lieferschein folgt nur einer gültigen Auftragsbestätigung zu demselben Angebot.',
          );
        }
      }

      const stand = await this.standIn(manager, workspaceId, angebot);
      const fehler = lieferFehler(stand, input.positionen);

      if (fehler !== null) {
        throw new BadRequestException(fehler);
      }

      const menge = new Map(
        input.positionen.map((eintrag) => [
          eintrag.angebotsPositionId,
          eintrag.menge,
        ]),
      );
      const zeilen = angebot.lines.filter((zeile) => menge.has(zeile.id));
      const offenVorher = new Map(
        stand.map((zeile) => [zeile.id, zeile.offen]),
      );

      const number = await this.naechsteNummer(
        manager,
        workspaceId,
        BegleitbelegArt.LIEFERSCHEIN,
        heute,
      );
      const beleg = await manager.save(
        manager.create(BegleitbelegEntity, {
          ...kopf,
          art: BegleitbelegArt.LIEFERSCHEIN,
          number,
          status: BegleitbelegStatus.GESTELLT,
          auftragsbestaetigungId: ab?.id ?? null,
          createdById: userId,
          issuedOn: heute,
          liefertermin: input.liefertermin ?? null,
          lieferadresse: this.text(input.lieferadresse),
          introText:
            this.text(input.introText) ??
            standardEinleitung({
              art: BegleitbelegArt.LIEFERSCHEIN,
              angebot: { number: angebot.number, issuedOn: angebot.issuedOn },
              auftragsbestaetigung:
                ab === null
                  ? null
                  : { number: ab.number, issuedOn: ab.issuedOn },
            }),
          closingText: this.text(input.closingText),
        }),
      );

      await manager.save(
        zeilen.map((zeile) => {
          const geliefert = menge.get(zeile.id) ?? 0;
          const rest =
            (tausendstel(offenVorher.get(zeile.id) ?? 0) -
              tausendstel(geliefert)) /
            1000;

          return manager.create(BegleitbelegPositionEntity, {
            belegId: beleg.id,
            angebotsPositionId: zeile.id,
            position: zeile.position,
            name: zeile.name,
            articleNumber: zeile.articleNumber,
            description: zeile.description,
            quantity: geliefert,
            unit: zeile.unit,
            unitPriceCents: zeile.unitPriceCents,
            discountPercent: Number(zeile.discountPercent),
            taxRatePercent: zeile.taxRatePercent,
            restOffen: Math.max(rest, 0),
          });
        }),
      );

      return beleg.id;
    });

    const beleg = await this.findOne(workspaceId, id);

    melde({
      workspaceId,
      event: 'delivery_note.issued',
      data: this.meldung(beleg),
    });

    return beleg;
  }

  async stornieren(
    workspaceId: string,
    userId: string | null,
    id: string,
    grund?: string | null,
  ): Promise<BegleitbelegEntity> {
    const beleg = await this.findOne(workspaceId, id);

    if (beleg.stornoVonId !== null) {
      throw new BadRequestException(
        'Ein Stornobeleg lässt sich nicht stornieren.',
      );
    }

    if (beleg.status === BegleitbelegStatus.STORNIERT) {
      throw new BadRequestException('Dieser Beleg ist bereits storniert.');
    }

    const heute = berlinDate(new Date());
    const briefkopf = await this.letterheads.get(workspaceId);
    const begruendung = this.text(grund);

    const stornoId = await this.dataSource.transaction(async (manager) => {
      const jetzt = await manager.query<{ status: string }[]>(
        `SELECT "status" FROM "begleitbelege" WHERE "id" = $1 FOR UPDATE`,
        [beleg.id],
      );

      if (jetzt[0]?.status !== BegleitbelegStatus.GESTELLT) {
        throw new BadRequestException('Dieser Beleg ist bereits storniert.');
      }

      if (beleg.art === BegleitbelegArt.AUFTRAGSBESTAETIGUNG) {
        const lieferscheine = await manager.find(BegleitbelegEntity, {
          where: {
            workspaceId,
            auftragsbestaetigungId: beleg.id,
            art: BegleitbelegArt.LIEFERSCHEIN,
            status: BegleitbelegStatus.GESTELLT,
            stornoVonId: IsNull(),
          },
          select: { number: true },
          order: { number: 'ASC' },
        });
        const offen = lieferscheine;

        if (offen.length > 0) {
          throw new BadRequestException(
            `Zu dieser Auftragsbestätigung gibt es noch die Lieferscheine ${offen.map((ls) => ls.number).join(', ')}. Stornieren Sie zuerst diese.`,
          );
        }
      }

      const number = await this.naechsteNummer(
        manager,
        workspaceId,
        beleg.art,
        heute,
      );
      const storno = await manager.save(
        manager.create(BegleitbelegEntity, {
          workspaceId,
          art: beleg.art,
          number,
          status: BegleitbelegStatus.GESTELLT,
          stornoVonId: beleg.id,
          stornoGrund: begruendung,
          angebotId: beleg.angebotId,
          auftragsbestaetigungId: beleg.auftragsbestaetigungId,
          companyId: beleg.companyId,
          contactId: beleg.contactId,
          dealId: beleg.dealId,
          bearbeiterId: beleg.bearbeiterId,
          createdById: userId,
          recipientAddress: beleg.recipientAddress,
          lieferadresse: beleg.lieferadresse,
          recipientVatId: beleg.recipientVatId,
          currency: beleg.currency,
          smallBusiness: beleg.smallBusiness,
          taxExemption: beleg.taxExemption,
          taxExemptionNote: beleg.taxExemptionNote,
          issuerSnapshot: absenderKopie(briefkopf),
          kontaktName: beleg.kontaktName,
          bearbeiterSnapshot: beleg.bearbeiterSnapshot,
          issuedOn: heute,
          liefertermin: null,
          introText: standardEinleitung({
            art: beleg.art,
            angebot: {
              number: beleg.angebot.number,
              issuedOn: beleg.angebot.issuedOn,
            },
            storno: {
              number: beleg.number,
              issuedOn: beleg.issuedOn,
              grund: begruendung,
            },
          }),
          closingText: null,
        }),
      );

      await manager.save(
        beleg.positionen.map((zeile) =>
          manager.create(BegleitbelegPositionEntity, {
            belegId: storno.id,
            angebotsPositionId: zeile.angebotsPositionId,
            position: zeile.position,
            name: zeile.name,
            articleNumber: zeile.articleNumber,
            description: zeile.description,
            quantity: zeile.quantity,
            unit: zeile.unit,
            unitPriceCents: zeile.unitPriceCents,
            discountPercent: zeile.discountPercent,
            taxRatePercent: zeile.taxRatePercent,
            restOffen: null,
          }),
        ),
      );

      await manager.update(
        BegleitbelegEntity,
        { id: beleg.id },
        {
          status: BegleitbelegStatus.STORNIERT,
          storniertAm: new Date(),
          stornoGrund: begruendung,
        },
      );

      return storno.id;
    });

    const storno = await this.findOne(workspaceId, stornoId);

    melde({
      workspaceId,
      event:
        beleg.art === BegleitbelegArt.AUFTRAGSBESTAETIGUNG
          ? 'order_confirmation.cancelled'
          : 'delivery_note.cancelled',
      data: { ...this.meldung(beleg), stornoNumber: storno.number },
    });

    return storno;
  }

  private meldung(beleg: BegleitbelegEntity): Record<string, unknown> {
    return {
      id: beleg.id,
      number: beleg.number,
      quoteId: beleg.angebotId,
      dealId: beleg.dealId,
      companyId: beleg.companyId,
      issuedOn: beleg.issuedOn,
    };
  }

  fileName(beleg: BegleitbelegEntity): string {
    const art =
      beleg.stornoVonId === null ? ART_TEXT[beleg.art].datei : 'Storno';

    return `${art}-${beleg.number.replace(/[^\w.-]/gu, '-')}.pdf`;
  }

  async pdf(
    workspaceId: string,
    id: string,
  ): Promise<{ fileName: string; content: Buffer }> {
    const beleg = await this.findOne(workspaceId, id);
    const letterhead = briefkopfFuer(
      await this.letterheads.get(workspaceId),
      beleg.issuerSnapshot,
    );

    const content = await renderBegleitbelegPdf({
      art: beleg.art,
      number: beleg.number,
      issuedOn: beleg.issuedOn,
      angebot: {
        number: beleg.angebot.number,
        issuedOn: beleg.angebot.issuedOn,
      },
      auftragsbestaetigung:
        beleg.auftragsbestaetigung === null
          ? null
          : {
              number: beleg.auftragsbestaetigung.number,
              issuedOn: beleg.auftragsbestaetigung.issuedOn,
            },
      storno:
        beleg.stornoVon === null
          ? null
          : {
              number: beleg.stornoVon.number,
              issuedOn: beleg.stornoVon.issuedOn,
              grund: beleg.stornoGrund,
            },
      recipientAddress: beleg.recipientAddress,
      lieferadresse: beleg.lieferadresse,
      liefertermin: beleg.liefertermin,
      introText: beleg.introText,
      closingText: beleg.closingText,
      smallBusiness: beleg.smallBusiness,
      befreiung: befreiungVon(beleg),
      contactName: beleg.kontaktName,
      bearbeiter: beleg.bearbeiterSnapshot,
      lines: beleg.positionen.map((zeile) => ({
        position: zeile.position,
        name: zeile.name,
        articleNumber: zeile.articleNumber,
        description: zeile.description,
        quantity: Number(zeile.quantity),
        unit: zeile.unit,
        unitPriceCents: zeile.unitPriceCents,
        discountPercent: Number(zeile.discountPercent),
        taxRatePercent: zeile.taxRatePercent,
        offen: zeile.restOffen,
      })),
      letterhead,
    });

    return { fileName: this.fileName(beleg), content };
  }

  async alsAnhang(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<AttachmentEntity> {
    const { fileName, content } = await this.pdf(workspaceId, id);
    const beleg = await this.findOne(workspaceId, id);

    return this.attachments.create({
      workspaceId,
      userId,
      name: fileName,
      mimeType: 'application/pdf',
      bytes: content,
      ziel: { quoteId: beleg.angebotId },
    });
  }
}

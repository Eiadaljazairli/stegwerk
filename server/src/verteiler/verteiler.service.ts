import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { ContactEntity } from '../crm/entities/contact.entity';
import { sichtbarkeitsBedingung } from '../workspaces/sichtbarkeit';
import {
  VerteilerEntity,
  VerteilerMitgliedEntity,
  type VerteilerMitgliedView,
} from './verteiler.entity';

export const MAX_MITGLIEDER = 5000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_VERTEILER = 200;

export type VerteilerEingabe = {
  name?: string | null;
  beschreibung?: string | null;
};

@Injectable()
export class VerteilerService {
  constructor(
    @InjectRepository(VerteilerEntity)
    private readonly verteiler: Repository<VerteilerEntity>,
    @InjectRepository(VerteilerMitgliedEntity)
    private readonly mitglieder: Repository<VerteilerMitgliedEntity>,
  ) {}

  private async sichtbareKontakte(
    workspaceId: string,
    kontaktIds: string[],
  ): Promise<string[]> {
    const ids = [...new Set(kontaktIds)].filter((kennung) =>
      UUID.test(kennung),
    );

    if (ids.length === 0) {
      return [];
    }

    const bedingung = await this.kontaktBedingung('k');
    const gefunden: string[] = [];

    for (let i = 0; i < ids.length; i += 1000) {
      const zeilen = await this.verteiler.manager
        .createQueryBuilder(ContactEntity, 'k')
        .select('k.id', 'id')
        .where('k."workspaceId" = :workspaceId', { workspaceId })
        .andWhere('k.id IN (:...ids)', { ids: ids.slice(i, i + 1000) })
        .andWhere(bedingung.where, bedingung.parameters)
        .getRawMany<{ id: string }>();

      gefunden.push(...zeilen.map((zeile) => zeile.id));
    }

    return gefunden;
  }

  private async kontaktBedingung(
    alias: string,
  ): Promise<{ where: string; parameters: Record<string, unknown> }> {
    const zeilen = await sichtbarkeitsBedingung('contact', alias);
    const geloescht = `${alias}."deletedAt" IS NULL`;

    return zeilen === null
      ? { where: geloescht, parameters: {} }
      : {
          where: `${geloescht} AND ${zeilen.where}`,
          parameters: zeilen.parameters,
        };
  }

  async liste(workspaceId: string): Promise<VerteilerEntity[]> {
    const alle = await this.verteiler.find({
      where: { workspaceId },
      order: { name: 'ASC' },
    });

    return this.mitAnzahl(workspaceId, alle);
  }

  private async mitAnzahl(
    workspaceId: string,
    liste: VerteilerEntity[],
  ): Promise<VerteilerEntity[]> {
    if (liste.length === 0) {
      return liste;
    }

    const bedingung = await this.kontaktBedingung('k');
    const zahlen = await this.mitglieder
      .createQueryBuilder('m')
      .innerJoin('m.contact', 'k')
      .select('m."verteilerId"', 'verteilerId')
      .addSelect('count(*)::int', 'anzahl')
      .where('m."workspaceId" = :workspaceId', { workspaceId })
      .andWhere('m."verteilerId" IN (:...ids)', {
        ids: liste.map((eintrag) => eintrag.id),
      })
      .andWhere(bedingung.where, bedingung.parameters)
      .groupBy('m."verteilerId"')
      .getRawMany<{ verteilerId: string; anzahl: number }>();
    const nachId = new Map(zahlen.map((z) => [z.verteilerId, z.anzahl]));

    return liste.map((eintrag) =>
      Object.assign(eintrag, { anzahl: nachId.get(eintrag.id) ?? 0 }),
    );
  }

  async einer(workspaceId: string, id: string): Promise<VerteilerEntity> {
    const gefunden = await this.verteiler.findOne({
      where: { id, workspaceId },
    });

    if (gefunden === null) {
      throw new NotFoundException('Diesen Verteiler gibt es nicht.');
    }

    const [mit] = await this.mitAnzahl(workspaceId, [gefunden]);

    return mit;
  }

  private pruefeName(roh: string | null | undefined): string {
    const name = (roh ?? '').trim();

    if (name === '') {
      throw new BadRequestException('Der Verteiler braucht einen Namen.');
    }

    return name.slice(0, 120);
  }

  private async nameFrei(
    workspaceId: string,
    name: string,
    ausser?: string,
  ): Promise<void> {
    const gleich = await this.verteiler
      .createQueryBuilder('v')
      .where('v."workspaceId" = :workspaceId', { workspaceId })
      .andWhere('lower(v.name) = lower(:name)', { name })
      .andWhere(ausser === undefined ? 'TRUE' : 'v.id <> :ausser', { ausser })
      .getCount();

    if (gleich > 0) {
      throw new ConflictException(`Einen Verteiler „${name}“ gibt es schon.`);
    }
  }

  async anlegen(
    caller: RequestUser,
    eingabe: VerteilerEingabe,
  ): Promise<VerteilerEntity> {
    const name = this.pruefeName(eingabe.name);

    if (
      (await this.verteiler.countBy({ workspaceId: caller.workspaceId })) >=
      MAX_VERTEILER
    ) {
      throw new BadRequestException(
        `Höchstens ${String(MAX_VERTEILER)} Verteiler je Arbeitsbereich.`,
      );
    }

    await this.nameFrei(caller.workspaceId, name);

    const neu = await this.verteiler.save(
      this.verteiler.create({
        workspaceId: caller.workspaceId,
        name,
        beschreibung: eingabe.beschreibung?.trim().slice(0, 500) || null,
        createdById: caller.apiKey === undefined ? caller.userId : null,
      }),
    );

    return Object.assign(neu, { anzahl: 0 });
  }

  async aendern(
    caller: RequestUser,
    id: string,
    eingabe: VerteilerEingabe,
  ): Promise<VerteilerEntity> {
    const vorhanden = await this.einer(caller.workspaceId, id);

    if (eingabe.name !== undefined && eingabe.name !== null) {
      const name = this.pruefeName(eingabe.name);

      await this.nameFrei(caller.workspaceId, name, id);
      vorhanden.name = name;
    }

    if (eingabe.beschreibung !== undefined) {
      vorhanden.beschreibung =
        eingabe.beschreibung?.trim().slice(0, 500) || null;
    }

    await this.verteiler.update(
      { id, workspaceId: caller.workspaceId },
      { name: vorhanden.name, beschreibung: vorhanden.beschreibung },
    );

    return this.einer(caller.workspaceId, id);
  }

  async loeschen(caller: RequestUser, id: string): Promise<boolean> {
    await this.einer(caller.workspaceId, id);

    const weg = await this.verteiler.delete({
      id,
      workspaceId: caller.workspaceId,
    });

    return (weg.affected ?? 0) > 0;
  }

  async mitgliederListe(
    workspaceId: string,
    id: string,
  ): Promise<VerteilerMitgliedView[]> {
    await this.einer(workspaceId, id);

    const bedingung = await this.kontaktBedingung('k');
    const zeilen = await this.mitglieder
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.contact', 'k')
      .leftJoinAndSelect('k.company', 'firma')
      .where('m."workspaceId" = :workspaceId', { workspaceId })
      .andWhere('m."verteilerId" = :id', { id })
      .andWhere(bedingung.where, bedingung.parameters)
      .orderBy('k.lastName', 'ASC')
      .addOrderBy('k.firstName', 'ASC')
      .take(MAX_MITGLIEDER)
      .getMany();
    const adressen = zeilen
      .map((zeile) => zeile.contact.email?.trim().toLowerCase() ?? '')
      .filter((adresse) => adresse !== '');
    const abgemeldet = new Set(
      adressen.length === 0
        ? []
        : (
            (await this.mitglieder.manager.query(
              `SELECT "email" FROM "abmeldungen"
                WHERE "workspaceId" = $1 AND "thema" = 'alle'
                  AND "email" = ANY($2::text[])`,
              [workspaceId, adressen],
            )) as { email: string }[]
          ).map((zeile) => zeile.email),
    );

    return zeilen.map((zeile) => ({
      contact: zeile.contact,
      hinzugefuegtAm: zeile.hinzugefuegtAm,
      abgemeldet: abgemeldet.has(
        zeile.contact.email?.trim().toLowerCase() ?? '',
      ),
    }));
  }

  async hinzufuegen(
    caller: RequestUser,
    id: string,
    kontaktIds: string[],
  ): Promise<VerteilerEntity> {
    await this.einer(caller.workspaceId, id);

    const gueltig = await this.sichtbareKontakte(
      caller.workspaceId,
      kontaktIds,
    );
    const schon = await this.mitglieder.countBy({
      verteilerId: id,
      workspaceId: caller.workspaceId,
    });
    const darunterSchon =
      gueltig.length === 0
        ? 0
        : await this.mitglieder
            .createQueryBuilder('m')
            .where('m."verteilerId" = :id', { id })
            .andWhere('m."workspaceId" = :workspaceId', {
              workspaceId: caller.workspaceId,
            })
            .andWhere('m."contactId" = ANY(:gueltig::uuid[])', { gueltig })
            .getCount();

    if (schon + gueltig.length - darunterSchon > MAX_MITGLIEDER) {
      throw new BadRequestException(
        `Höchstens ${String(MAX_MITGLIEDER)} Kontakte je Verteiler.`,
      );
    }

    for (let i = 0; i < gueltig.length; i += 500) {
      await this.mitglieder
        .createQueryBuilder()
        .insert()
        .values(
          gueltig.slice(i, i + 500).map((contactId) => ({
            verteilerId: id,
            contactId,
            workspaceId: caller.workspaceId,
          })),
        )
        .orIgnore()
        .execute();
    }

    return this.einer(caller.workspaceId, id);
  }

  async entfernen(
    caller: RequestUser,
    id: string,
    kontaktIds: string[],
  ): Promise<VerteilerEntity> {
    await this.einer(caller.workspaceId, id);

    const sichtbar = await this.sichtbareKontakte(
      caller.workspaceId,
      kontaktIds,
    );

    if (sichtbar.length > 0) {
      await this.mitglieder
        .createQueryBuilder()
        .delete()
        .where('"verteilerId" = :id', { id })
        .andWhere('"workspaceId" = :workspaceId', {
          workspaceId: caller.workspaceId,
        })
        .andWhere('"contactId" IN (:...sichtbar)', { sichtbar })
        .execute();
    }

    return this.einer(caller.workspaceId, id);
  }

  async fuerKontakt(
    workspaceId: string,
    contactId: string,
  ): Promise<VerteilerEntity[]> {
    const liste = await this.verteiler
      .createQueryBuilder('v')
      .innerJoin(
        VerteilerMitgliedEntity,
        'm',
        'm."verteilerId" = v.id AND m."contactId" = :contactId',
        { contactId },
      )
      .where('v."workspaceId" = :workspaceId', { workspaceId })
      .orderBy('v.name', 'ASC')
      .getMany();

    return this.mitAnzahl(workspaceId, liste);
  }
}

export const mitgliedsIds = async (
  manager: Repository<ContactEntity>['manager'],
  workspaceId: string,
  verteilerId: string,
): Promise<string[] | null> => {
  const gibt = (await manager.query(
    `SELECT 1 FROM "verteiler" WHERE "id" = $1 AND "workspaceId" = $2`,
    [verteilerId, workspaceId],
  )) as unknown[];

  if (gibt.length === 0) {
    return null;
  }

  const zeilen = (await manager.query(
    `SELECT "contactId" FROM "verteiler_mitglieder"
      WHERE "verteilerId" = $1 AND "workspaceId" = $2
      LIMIT $3`,
    [verteilerId, workspaceId, MAX_MITGLIEDER],
  )) as { contactId: string }[];

  return zeilen.map((zeile) => zeile.contactId);
};

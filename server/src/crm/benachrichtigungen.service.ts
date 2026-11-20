import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';

import { ApiKeyEntity } from '../api-keys/api-key.entity';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { erwaehnungMail } from '../mail/templates';
import { MailService } from '../mail/mail.service';
import { runWithRequestContext } from '../observability/request-context';
import { UserEntity } from '../users/user.entity';
import { MembershipEntity } from '../workspaces/membership.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { setzeSichtfeld } from '../workspaces/sichtbarkeit';
import { zielSichtbar } from '../workspaces/ziel-sichtbarkeit';
import { BenachrichtigungEntity } from './entities/benachrichtigung.entity';
import { CompanyEntity } from './entities/company.entity';
import { ContactEntity } from './entities/contact.entity';
import { DealEntity } from './entities/deal.entity';
import { erwaehnteNutzer } from './formatierter-text';
import { NotesService } from './notes.service';
import { TasksService } from './tasks.service';

export type ErwaehnungsOrt = { noteId: string } | { taskId: string };

export type Einsicht = {
  text: string;
  akte: {
    typ: 'company' | 'contact' | 'deal';
    id: string;
    name: string;
  } | null;
  pfad: string;
};

const AKTE_RECHT = {
  companyId: Permission.COMPANY_VIEW,
  contactId: Permission.CONTACT_VIEW,
  dealId: Permission.DEAL_VIEW,
} as const;

const AKTE_PFAD = {
  company: '/firmen',
  contact: '/kontakte',
  deal: '/geschaefte',
} as const;

type MitAkte = {
  companyId: string | null;
  contactId: string | null;
  dealId: string | null;
};

@Injectable()
export class BenachrichtigungenService {
  private readonly logger = new Logger(BenachrichtigungenService.name);

  constructor(
    @InjectRepository(BenachrichtigungEntity)
    private readonly benachrichtigungen: Repository<BenachrichtigungEntity>,
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(CompanyEntity)
    private readonly companies: Repository<CompanyEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(DealEntity)
    private readonly deals: Repository<DealEntity>,
    private readonly notes: NotesService,
    private readonly tasks: TasksService,
    private readonly permissions: PermissionsService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async nachDemSpeichernVon(
    anrufer: RequestUser,
    ort: ErwaehnungsOrt,
    vorher: string | null,
    nachher: string | null,
  ): Promise<string[]> {
    try {
      return await this.nachDemSpeichern(
        anrufer.workspaceId,
        await this.absender(anrufer),
        ort,
        vorher,
        nachher,
      );
    } catch (fehler) {
      this.logger.warn(
        `Erwähnungen nicht gemeldet: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
      );

      return [];
    }
  }

  private async absender(anrufer: RequestUser): Promise<string | null> {
    if (anrufer.apiKey === undefined) {
      return anrufer.userId;
    }

    const schluessel = await this.users.manager.findOne(ApiKeyEntity, {
      where: { id: anrufer.apiKey.id, workspaceId: anrufer.workspaceId },
    });

    return schluessel?.createdById ?? null;
  }

  async nachDemSpeichern(
    workspaceId: string,
    vonId: string | null,
    ort: ErwaehnungsOrt,
    vorher: string | null,
    nachher: string | null,
  ): Promise<string[]> {
    const alt = new Set(erwaehnteNutzer(vorher));
    const kandidaten = erwaehnteNutzer(nachher).filter(
      (id) => !alt.has(id) && id !== vonId,
    );

    if (kandidaten.length === 0) {
      return [];
    }

    const mitglieder = await this.memberships.find({
      where: { workspaceId, userId: In(kandidaten) },
      relations: { user: true },
    });

    if (mitglieder.length === 0) {
      return [];
    }

    const spalte = 'noteId' in ort ? 'noteId' : 'taskId';
    const zielId = 'noteId' in ort ? ort.noteId : ort.taskId;
    const zeilen = mitglieder.map((m) => m.userId);
    const werte = zeilen.map(
      (_id, i) => `($1, $${String(i + 4)}, $2, 'erwaehnung', $3)`,
    );
    const eingefuegt = (await this.benachrichtigungen.query(
      `INSERT INTO "benachrichtigungen" ("workspaceId", "empfaengerId", "vonId", "art", "${spalte}")
       VALUES ${werte.join(', ')}
       ON CONFLICT ("empfaengerId", "${spalte}") WHERE "${spalte}" IS NOT NULL DO NOTHING
       RETURNING "empfaengerId"`,
      [workspaceId, vonId, zielId, ...zeilen],
    )) as { empfaengerId: string }[];
    const neu = new Set(eingefuegt.map((zeile) => zeile.empfaengerId));

    const von =
      vonId === null
        ? null
        : await this.users.findOne({ where: { id: vonId } });
    const vonName =
      von === null ? 'Jemand' : `${von.firstName} ${von.lastName}`.trim();

    for (const mitglied of mitglieder) {
      if (!neu.has(mitglied.userId) || !mitglied.erwaehnungMail) {
        continue;
      }

      try {
        const einsicht = await this.alsEmpfaengerin(
          { userId: mitglied.userId, workspaceId, email: mitglied.user.email },
          (empfaengerin) => this.einsicht(empfaengerin, ort),
        );

        await this.mail.send(
          erwaehnungMail(
            mitglied.user.email,
            vonName,
            'noteId' in ort ? 'Notiz' : 'Aufgabe',
            einsicht?.akte?.name ?? null,
            `${this.webOrigin()}${einsicht?.pfad ?? '/'}`,
          ),
        );
      } catch (fehler) {
        this.logger.warn(
          `Erwähnungs-Mail nicht verschickt: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
        );
      }
    }

    return [...neu];
  }

  async einsicht(
    empfaengerin: RequestUser,
    ort: ErwaehnungsOrt,
  ): Promise<Einsicht | null> {
    try {
      if ('noteId' in ort) {
        const note = await this.notes.findOne(
          empfaengerin.workspaceId,
          ort.noteId,
        );

        if (!(await this.darfAkteSehen(empfaengerin, note))) {
          return null;
        }

        const akte = await this.akteVon(note);

        return {
          text: note.body,
          akte,
          pfad: akte === null ? '/' : `${AKTE_PFAD[akte.typ]}/${akte.id}`,
        };
      }

      if (!(await this.permissions.can(empfaengerin, Permission.TASK_VIEW))) {
        return null;
      }

      const task = await this.tasks.findOne(
        empfaengerin.workspaceId,
        ort.taskId,
      );
      const akteSichtbar =
        (await this.darfAkteSehen(empfaengerin, task)) &&
        (await zielSichtbar(this.benachrichtigungen.manager, task));
      const akte = akteSichtbar ? await this.akteVon(task) : null;

      return {
        text: task.description ?? '',
        akte,
        pfad: `/aufgaben?aufgabe=${task.id}`,
      };
    } catch {
      return null;
    }
  }

  alsEmpfaengerin<T>(
    empfaengerin: RequestUser,
    arbeit: (empfaengerin: RequestUser) => Promise<T>,
  ): Promise<T> {
    return runWithRequestContext(
      {
        requestId: 'erwaehnung',
        userId: empfaengerin.userId,
        workspaceId: empfaengerin.workspaceId,
      },
      () => {
        setzeSichtfeld(() => this.permissions.sichtfeldFuer(empfaengerin));

        return arbeit(empfaengerin);
      },
    );
  }

  liste(
    empfaengerId: string,
    workspaceId: string,
    limit: number,
  ): Promise<BenachrichtigungEntity[]> {
    return this.benachrichtigungen.find({
      where: { empfaengerId, workspaceId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  ungelesen(empfaengerId: string, workspaceId: string): Promise<number> {
    return this.benachrichtigungen.count({
      where: { empfaengerId, workspaceId, gelesenAm: IsNull() },
    });
  }

  async gelesen(
    empfaengerId: string,
    workspaceId: string,
    id?: string,
  ): Promise<number> {
    const ergebnis = await this.benachrichtigungen.update(
      {
        empfaengerId,
        workspaceId,
        gelesenAm: IsNull(),
        ...(id === undefined ? {} : { id }),
      },
      { gelesenAm: new Date() },
    );

    return ergebnis.affected ?? 0;
  }

  async entwurfEinsicht(
    empfaengerin: RequestUser,
    id: string,
  ): Promise<{ betreff: string; quelle: string } | null> {
    const [zeile] = (await this.benachrichtigungen.query(
      `SELECT "betreff", "quelle" FROM "mail_entwuerfe"
        WHERE "id" = $1 AND "workspaceId" = $2 AND "ownerId" = $3`,
      [id, empfaengerin.workspaceId, empfaengerin.userId],
    )) as { betreff: string; quelle: string }[];

    return zeile ?? null;
  }

  async name(userId: string | null): Promise<string> {
    if (userId === null) {
      return 'Ein ehemaliges Mitglied';
    }

    const user = await this.users.findOne({ where: { id: userId } });

    return user === null ? 'Unbekannt' : `${user.firstName} ${user.lastName}`;
  }

  private async darfAkteSehen(
    empfaengerin: RequestUser,
    ziel: MitAkte,
  ): Promise<boolean> {
    for (const spalte of Object.keys(AKTE_RECHT) as (keyof MitAkte)[]) {
      if (
        ziel[spalte] !== null &&
        !(await this.permissions.can(empfaengerin, AKTE_RECHT[spalte]))
      ) {
        return false;
      }
    }

    return true;
  }

  private async akteVon(ziel: MitAkte): Promise<Einsicht['akte']> {
    if (ziel.dealId !== null) {
      const deal = await this.deals.findOne({ where: { id: ziel.dealId } });

      return deal === null
        ? null
        : { typ: 'deal', id: deal.id, name: deal.name };
    }

    if (ziel.companyId !== null) {
      const firma = await this.companies.findOne({
        where: { id: ziel.companyId },
      });

      return firma === null
        ? null
        : { typ: 'company', id: firma.id, name: firma.name };
    }

    if (ziel.contactId !== null) {
      const kontakt = await this.contacts.findOne({
        where: { id: ziel.contactId },
      });

      return kontakt === null
        ? null
        : {
            typ: 'contact',
            id: kontakt.id,
            name: `${kontakt.firstName} ${kontakt.lastName}`.trim(),
          };
    }

    return null;
  }

  private webOrigin(): string {
    return (
      this.config.get<string>('webOrigin') ?? 'http://localhost:5273'
    ).replace(/\/$/u, '');
  }
}

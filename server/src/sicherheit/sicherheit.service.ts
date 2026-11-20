import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, LessThan } from 'typeorm';

import { UserEntity } from '../users/user.entity';
import { hoereSicherheit, type SicherheitsMeldung } from './melden';
import { SicherheitsEreignisEntity } from './sicherheits-ereignis.entity';

export const AUFBEWAHRUNG_TAGE = 365;

export type EreignisMitNamen = SicherheitsEreignisEntity & {
  person: string | null;
  handelnd: string | null;
};

@Injectable()
export class SicherheitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SicherheitService.name);
  private abmelden: (() => void) | null = null;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    this.abmelden = hoereSicherheit((meldung) => void this.schreibe(meldung));
  }

  onModuleDestroy(): void {
    this.abmelden?.();
  }

  async schreibe(meldung: SicherheitsMeldung): Promise<void> {
    try {
      await this.dataSource.getRepository(SicherheitsEreignisEntity).insert({
        art: meldung.art,
        userId: meldung.userId ?? null,
        workspaceId: meldung.workspaceId ?? null,
        actorId: meldung.actorId ?? null,
        details: meldung.details ?? null,
        geraet: meldung.geraet?.slice(0, 80) ?? null,
        ipGekuerzt: meldung.ipGekuerzt?.slice(0, 45) ?? null,
      });
    } catch (fehler) {
      this.logger.warn(
        `Sicherheitsereignis nicht geschrieben: ${String(fehler)}`,
      );
    }
  }

  async aufraeumen(jetzt = new Date()): Promise<number> {
    const grenze = new Date(jetzt.getTime() - AUFBEWAHRUNG_TAGE * 86_400_000);
    const weg = await this.dataSource
      .getRepository(SicherheitsEreignisEntity)
      .delete({ createdAt: LessThan(grenze) });

    return weg.affected ?? 0;
  }

  async meinVerlauf(userId: string): Promise<EreignisMitNamen[]> {
    const zeilen = await this.dataSource
      .getRepository(SicherheitsEreignisEntity)
      .find({
        where: [{ userId }, { actorId: userId }],
        order: { createdAt: 'DESC' },
        take: 50,
      });

    return this.mitNamen(zeilen);
  }

  async bereich(workspaceId: string): Promise<EreignisMitNamen[]> {
    const zeilen = await this.dataSource
      .getRepository(SicherheitsEreignisEntity)
      .find({
        where: { workspaceId },
        order: { createdAt: 'DESC' },
        take: 200,
      });

    return this.mitNamen(zeilen);
  }

  private async mitNamen(
    zeilen: SicherheitsEreignisEntity[],
  ): Promise<EreignisMitNamen[]> {
    const ids = [
      ...new Set(
        zeilen
          .flatMap((z) => [z.userId, z.actorId])
          .filter((id): id is string => id !== null),
      ),
    ];
    const namen = new Map(
      (ids.length === 0
        ? []
        : await this.dataSource.getRepository(UserEntity).find({
            where: ids.map((id) => ({ id })),
          })
      ).map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || u.email]),
    );

    return zeilen.map((z) => ({
      ...z,
      person: z.userId === null ? null : (namen.get(z.userId) ?? null),
      handelnd: z.actorId === null ? null : (namen.get(z.actorId) ?? null),
    }));
  }
}

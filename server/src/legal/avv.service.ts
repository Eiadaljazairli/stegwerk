import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { getRequestContext } from '../observability/request-context';
import { privacyFacts } from '../privacy/privacy-facts';
import { LetterheadEntity } from '../quotes/letterhead.entity';
import { meldeSicherheit } from '../sicherheit/melden';
import { UserEntity } from '../users/user.entity';
import { PermissionsService } from '../workspaces/permissions.service';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { AvvAnnahmeEntity } from './avv-annahme.entity';
import { type DpaDocument, dpaDocument } from './dpa-document';

export const auftragnehmerName = (
  legal: Record<string, string> | undefined,
): string | null => {
  const firma = legal?.companyName;

  if (firma === undefined || firma === '') {
    return null;
  }

  const form = legal?.legalForm;

  return form === undefined || form === '' ? firma : `${firma} ${form}`;
};

@Injectable()
export class AvvService {
  constructor(
    @InjectRepository(AvvAnnahmeEntity)
    private readonly annahmen: Repository<AvvAnnahmeEntity>,
    @InjectRepository(LetterheadEntity)
    private readonly briefkoepfe: Repository<LetterheadEntity>,
    private readonly permissions: PermissionsService,
    private readonly config: ConfigService,
  ) {}

  vertrag(): DpaDocument {
    return dpaDocument(
      privacyFacts(process.env),
      auftragnehmerName(this.config.get<Record<string, string>>('legal')),
    );
  }

  fassung(dokument: DpaDocument = this.vertrag()): string {
    return createHash('sha256').update(JSON.stringify(dokument)).digest('hex');
  }

  async auftraggeber(workspaceId: string): Promise<string> {
    const [kopf, bereich] = await Promise.all([
      this.briefkoepfe.findOne({ where: { workspaceId } }),
      this.annahmen.manager.findOne(WorkspaceEntity, {
        where: { id: workspaceId },
      }),
    ]);

    const ort = [kopf?.postalCode, kopf?.city]
      .filter((teil) => teil != null && teil !== '')
      .join(' ');

    return [
      kopf?.companyName ?? bereich?.name,
      kopf?.street,
      ort,
      kopf?.country,
    ]
      .filter((teil) => teil != null && teil !== '')
      .join(', ')
      .slice(0, 500);
  }

  letzte(workspaceId: string): Promise<AvvAnnahmeEntity | null> {
    return this.annahmen.findOne({
      where: { workspaceId },
      order: { angenommenAm: 'DESC' },
    });
  }

  async annehmen(caller: RequestUser): Promise<AvvAnnahmeEntity> {
    const rolle = await this.permissions.permissionsOf(caller);

    if (!rolle.everything || caller.apiKey !== undefined) {
      throw new ForbiddenException(
        'Den Vertrag nimmt der Inhaber des Arbeitsbereichs an.',
      );
    }

    const dokument = this.vertrag();

    if (!dokument.reviewed) {
      throw new BadRequestException(
        'Der Vertrag ist noch als Entwurf markiert und kann erst nach der rechtlichen Prüfung angenommen werden.',
      );
    }

    const person = await this.annahmen.manager.findOne(UserEntity, {
      where: { id: caller.userId },
    });

    const annahme = await this.annahmen.save(
      this.annahmen.create({
        workspaceId: caller.workspaceId,
        userId: caller.userId,
        angenommenVon:
          person === null
            ? caller.email
            : `${person.firstName} ${person.lastName} <${person.email}>`,
        auftraggeber: await this.auftraggeber(caller.workspaceId),
        fassung: this.fassung(dokument),
        ipGekuerzt: getRequestContext()?.ipGekuerzt ?? null,
      }),
    );

    meldeSicherheit({
      art: 'avv_angenommen',
      workspaceId: caller.workspaceId,
      actorId: caller.userId,
      details: { fassung: annahme.fassung.slice(0, 12) },
    });

    return annahme;
  }
}

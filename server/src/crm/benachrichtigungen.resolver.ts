import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BenachrichtigungenService } from './benachrichtigungen.service';
import { kurzfassung } from './formatierter-text';

@ObjectType('Benachrichtigung')
export class BenachrichtigungView {
  @Field(() => ID)
  id: string;

  @Field()
  art: string;

  @Field()
  wo: string;

  @Field()
  von: string;

  @Field()
  erstelltAm: Date;

  @Field()
  gelesen: boolean;

  @Field()
  sichtbar: boolean;

  @Field(() => String, { nullable: true })
  auszug: string | null;

  @Field(() => String, { nullable: true })
  akte: string | null;

  @Field(() => String, { nullable: true })
  pfad: string | null;
}

@Resolver(() => BenachrichtigungView)
@UseGuards(GqlAuthGuard)
export class BenachrichtigungenResolver {
  constructor(private readonly service: BenachrichtigungenService) {}

  @Query(() => [BenachrichtigungView])
  async benachrichtigungen(
    @CurrentUser() user: RequestUser,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<BenachrichtigungView[]> {
    const zeilen = await this.service.liste(
      user.userId,
      user.workspaceId,
      Math.min(Math.max(limit ?? 20, 1), 50),
    );
    const ergebnis: BenachrichtigungView[] = [];

    for (const zeile of zeilen) {
      if (zeile.mailEntwurfId !== null) {
        const entwurf = await this.service.entwurfEinsicht(
          user,
          zeile.mailEntwurfId,
        );

        ergebnis.push({
          id: zeile.id,
          art: zeile.art,
          wo: 'entwurf',
          von:
            zeile.vonId !== null
              ? await this.service.name(zeile.vonId)
              : entwurf?.quelle === 'automation'
                ? 'Eine Automation'
                : 'Ein KI-Assistent',
          erstelltAm: zeile.createdAt,
          gelesen: zeile.gelesenAm !== null,
          sichtbar: entwurf !== null,
          auszug: entwurf?.betreff ?? null,
          akte: null,
          pfad:
            entwurf === null
              ? null
              : `/postfach?entwurf=${zeile.mailEntwurfId}#entwuerfe`,
        });
        continue;
      }

      const ort =
        zeile.noteId !== null
          ? { noteId: zeile.noteId }
          : { taskId: zeile.taskId ?? '' };
      const einsicht = await this.service.einsicht(user, ort);

      ergebnis.push({
        id: zeile.id,
        art: zeile.art,
        wo: zeile.noteId !== null ? 'notiz' : 'aufgabe',
        von: await this.service.name(zeile.vonId),
        erstelltAm: zeile.createdAt,
        gelesen: zeile.gelesenAm !== null,
        sichtbar: einsicht !== null,
        auszug: einsicht === null ? null : kurzfassung(einsicht.text),
        akte: einsicht?.akte?.name ?? null,
        pfad: einsicht?.pfad ?? null,
      });
    }

    return ergebnis;
  }

  @Query(() => Int)
  ungeleseneBenachrichtigungen(
    @CurrentUser() user: RequestUser,
  ): Promise<number> {
    return this.service.ungelesen(user.userId, user.workspaceId);
  }

  @Mutation(() => Int)
  benachrichtigungGelesen(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID, nullable: true }) id?: string,
  ): Promise<number> {
    return this.service.gelesen(user.userId, user.workspaceId, id);
  }
}

import { ForbiddenException, UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  InputType,
  Mutation,
  ObjectType,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNotEmpty, MaxLength } from 'class-validator';
import { Repository } from 'typeorm';

import { NurMenschWache } from '../api-keys/api-key.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { GqlThrottlerGuard } from '../auth/guards/gql-throttler.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { AppointmentEntity } from '../calendar/appointment.entity';
import { AppointmentsService } from '../calendar/appointments.service';
import {
  istGeschwaerzt,
  sichtregelLaden,
} from '../calendar/termin-sichtbarkeit';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { fehlerZeigen } from '../mailboxes/abruf-fehler';
import {
  type KalenderSichtbarkeit,
  KalenderVerbindungEntity,
} from './kalender-verbindung.entity';
import { KalenderSyncService } from './kalender-sync.service';

@ObjectType()
export class GefundenerKalenderView {
  @Field()
  url: string;

  @Field()
  name: string;
}

@ObjectType()
export class KalenderVerbindenErgebnis {
  @Field(() => KalenderVerbindungEntity)
  verbindung: KalenderVerbindungEntity;

  @Field(() => [GefundenerKalenderView])
  kalender: GefundenerKalenderView[];
}

@InputType()
export class KalenderVerbindenInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(500)
  serverUrl: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(200)
  benutzer: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(500)
  passwort: string;
}

@Resolver()
@UseGuards(GqlAuthGuard, NurMenschWache)
export class KalenderSyncResolver {
  constructor(
    private readonly sync: KalenderSyncService,
    private readonly permissions: PermissionsService,
    private readonly appointments: AppointmentsService,
    @InjectRepository(AppointmentEntity)
    private readonly termine: Repository<AppointmentEntity>,
  ) {}

  @Query(() => KalenderVerbindungEntity, { nullable: true })
  kalenderVerbindung(
    @CurrentUser() user: RequestUser,
  ): Promise<KalenderVerbindungEntity | null> {
    return this.sync.stand(user);
  }

  @Query(() => [GefundenerKalenderView])
  kalenderListe(
    @CurrentUser() user: RequestUser,
  ): Promise<GefundenerKalenderView[]> {
    return this.sync.kalenderListe(user);
  }

  @Mutation(() => KalenderVerbindenErgebnis)
  @UseGuards(GqlThrottlerGuard, BillingWriteGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  kalenderVerbinden(
    @CurrentUser() user: RequestUser,
    @Args('input') input: KalenderVerbindenInput,
  ): Promise<KalenderVerbindenErgebnis> {
    return this.sync.verbinden(user, input);
  }

  @Mutation(() => KalenderVerbindungEntity)
  @UseGuards(BillingWriteGuard)
  kalenderWaehlen(
    @CurrentUser() user: RequestUser,
    @Args('url') url: string,
  ): Promise<KalenderVerbindungEntity> {
    return this.sync.kalenderWaehlen(user, url);
  }

  @Mutation(() => KalenderVerbindungEntity)
  @UseGuards(BillingWriteGuard)
  kalenderSichtbarkeitSetzen(
    @CurrentUser() user: RequestUser,
    @Args('sichtbarkeit') sichtbarkeit: string,
  ): Promise<KalenderVerbindungEntity> {
    return this.sync.sichtbarkeitSetzen(
      user,
      sichtbarkeit as KalenderSichtbarkeit,
    );
  }

  @Mutation(() => Boolean)
  kalenderTrennen(@CurrentUser() user: RequestUser): Promise<boolean> {
    return this.sync.trennen(user);
  }

  @Mutation(() => KalenderVerbindungEntity)
  @UseGuards(GqlThrottlerGuard, BillingWriteGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  kalenderAbgleichen(
    @CurrentUser() user: RequestUser,
  ): Promise<KalenderVerbindungEntity> {
    return this.sync.jetztAbgleichen(user);
  }

  @Mutation(() => AppointmentEntity)
  @UseGuards(GqlThrottlerGuard, BillingWriteGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async terminEinladungSenden(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AppointmentEntity> {
    await this.permissions.assert(
      user,
      Permission.APPOINTMENT_WRITE,
      'Einladungen zu Terminen zu verschicken',
    );

    const termin = await this.appointments.byId(user.workspaceId, id);

    if (
      istGeschwaerzt(
        termin,
        await sichtregelLaden(
          this.termine.manager,
          user.workspaceId,
          user.userId,
        ),
      )
    ) {
      throw new ForbiddenException(
        'Dieser Termin ist privat. Einladen kann nur, in wessen Kalender er steht.',
      );
    }

    return this.sync.einladungSenden(user, termin.id);
  }
}

@Resolver(() => KalenderVerbindungEntity)
export class KalenderVerbindungFelderResolver {
  @ResolveField(() => Boolean)
  fehlerZeigen(@Parent() verbindung: KalenderVerbindungEntity): boolean {
    return fehlerZeigen({ ...verbindung, fehler: verbindung.letzterFehler });
  }
}

import { BadRequestException, UseGuards } from '@nestjs/common';
import {
  Args,
  Context,
  Field,
  ID,
  InputType,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  MinLength,
} from 'class-validator';
import { type Request } from 'express';
import { Repository } from 'typeorm';

import { NurMenschWache } from '../api-keys/api-key.guard';
import { MailService } from '../mail/mail.service';
import { passwordChangedMail } from '../mail/templates';
import { meldeSicherheit } from '../sicherheit/melden';
import { UserEntity } from '../users/user.entity';
import { MembershipEntity } from '../workspaces/membership.entity';
import {
  CurrentUser,
  type RequestUser,
} from './decorators/current-user.decorator';
import { GqlAuthGuard } from './guards/gql-auth.guard';
import { GqlThrottlerGuard } from './guards/gql-throttler.guard';
import { RefreshTokensService } from './refresh-tokens.service';
import { KontoService } from './konto.service';
import { liesSitzung, loescheSitzung } from './sitzungs-cookie';
import { pruefePasswort } from './passwort-regeln';

const PASSWORD_SALT_ROUNDS = 12;

@InputType()
export class PasswortAendernInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(128)
  aktuell: string;

  @Field()
  @MinLength(12, { message: 'Das Passwort braucht mindestens 12 Zeichen.' })
  @MaxLength(128)
  neu: string;
}

@InputType()
export class ProfilInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(100)
  funktion?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(50)
  durchwahl?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(2000)
  mailSignatur?: string | null;
}

@InputType()
export class EmailAendernInput {
  @Field()
  @IsEmail()
  @MaxLength(320)
  neueEmail: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(128)
  passwort: string;
}

@Resolver()
@UseGuards(GqlAuthGuard, NurMenschWache)
export class KontoResolver {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    private readonly tokens: RefreshTokensService,
    private readonly mailService: MailService,
    private readonly konten: KontoService,
  ) {}

  @Mutation(() => Boolean)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async emailAendernAnfragen(
    @CurrentUser() user: RequestUser,
    @Args('input') input: EmailAendernInput,
  ): Promise<boolean> {
    await this.konten.emailAendernAnfragen(
      user.userId,
      input.neueEmail,
      input.passwort,
    );

    return true;
  }

  @Mutation(() => String)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  emailAendernBestaetigen(
    @CurrentUser() user: RequestUser,
    @Args('token') token: string,
  ): Promise<string> {
    return this.konten.emailAendernBestaetigen(user.userId, token);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async kontoLoeschen(
    @CurrentUser() user: RequestUser,
    @Args('passwort') passwort: string,
    @Context() kontext: { req: Request },
  ): Promise<boolean> {
    await this.konten.kontoLoeschen(user.userId, passwort);
    loescheSitzung(kontext.req.res);

    return true;
  }

  @Mutation(() => Boolean)
  async zweiFaktorZuruecksetzen(
    @CurrentUser() user: RequestUser,
    @Args('userId', { type: () => ID }) userId: string,
  ): Promise<boolean> {
    await this.konten.zweiFaktorZuruecksetzen(user, userId);

    return true;
  }

  @Mutation(() => UserEntity)
  async profilAendern(
    @CurrentUser() user: RequestUser,
    @Args('input') input: ProfilInput,
  ): Promise<UserEntity> {
    const konto = await this.users.findOneOrFail({
      where: { id: user.userId },
    });

    konto.firstName = input.firstName.trim();
    konto.lastName = input.lastName.trim();

    const leerAlsNull = (
      wert: string | null | undefined,
      bisher: string | null,
    ) =>
      wert === undefined
        ? bisher
        : wert === null || wert.trim() === ''
          ? null
          : wert.trim();

    konto.funktion = leerAlsNull(input.funktion, konto.funktion);
    konto.durchwahl = leerAlsNull(input.durchwahl, konto.durchwahl);
    konto.mailSignatur = leerAlsNull(input.mailSignatur, konto.mailSignatur);

    if (konto.firstName === '' || konto.lastName === '') {
      throw new BadRequestException(
        'Vor- und Nachname dürfen nicht leer sein.',
      );
    }

    return this.users.save(konto);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async passwortAendern(
    @CurrentUser() user: RequestUser,
    @Args('input') input: PasswortAendernInput,
    @Context() kontext: { req: Request },
  ): Promise<boolean> {
    const konto = await this.users.findOneOrFail({
      where: { id: user.userId },
    });

    if (!(await bcrypt.compare(input.aktuell, konto.passwordHash))) {
      throw new BadRequestException('Das bisherige Passwort stimmt nicht.');
    }

    if (input.aktuell === input.neu) {
      throw new BadRequestException(
        'Das neue Passwort ist dasselbe wie das bisherige.',
      );
    }

    pruefePasswort(input.neu, {
      email: konto.email,
      namen: [konto.firstName, konto.lastName],
    });

    konto.passwordHash = await bcrypt.hash(input.neu, PASSWORD_SALT_ROUNDS);
    await this.users.save(konto);

    await this.tokens.andereBeenden(
      user.userId,
      await this.tokens.sitzungVon(liesSitzung(kontext.req)),
    );

    meldeSicherheit({ art: 'passwort_geaendert', userId: user.userId });
    await this.mailService.send(passwordChangedMail(konto.email, true));

    return true;
  }

  @Query(() => Boolean)
  async zweiFaktorVerlangt(@CurrentUser() user: RequestUser): Promise<boolean> {
    const mitgliedschaft = await this.memberships.findOne({
      where: { userId: user.userId, workspaceId: user.workspaceId },
      relations: { workspace: true, user: true },
    });

    return (
      mitgliedschaft !== null &&
      mitgliedschaft.workspace.zweiFaktorPflicht &&
      mitgliedschaft.user.totpEnabledAt === null
    );
  }
}

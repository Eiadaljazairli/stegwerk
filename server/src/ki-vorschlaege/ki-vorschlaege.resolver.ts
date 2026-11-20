import { BadRequestException, UseGuards } from '@nestjs/common';
import {
  Args,
  Context,
  Field,
  ID,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';

import { NurMenschWache } from '../api-keys/api-key.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import {
  type FeldArt,
  type Feldrechte,
  feldrechteJetzt,
  ohneVerborgeneEigene,
  standardSchluessel,
} from '../workspaces/feldrechte';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import {
  KiVorschlagEntity,
  VORSCHLAG_STATUS,
  type VorschlagStatus,
  type VorschlagZielArt,
} from './ki-vorschlag.entity';
import { KiVorschlaegeService } from './ki-vorschlaege.service';

const PFAD: Record<VorschlagZielArt, string> = {
  company: '/firmen',
  contact: '/kontakte',
  deal: '/geschaefte',
  quote: '/angebote',
};

@ObjectType('KiVorschlag')
export class KiVorschlagView {
  @Field(() => ID)
  id: string;

  @Field()
  werkzeug: string;

  @Field()
  zusammenfassung: string;

  @Field()
  schluesselName: string;

  @Field(() => String, { nullable: true })
  zielArt: string | null;

  @Field(() => ID, { nullable: true })
  zielId: string | null;

  @Field(() => String, { nullable: true })
  zielName: string | null;

  @Field(() => String, { nullable: true })
  zielPfad: string | null;

  @Field(() => String, { nullable: true })
  vorher: string | null;

  @Field()
  nachher: string;

  @Field()
  status: string;

  @Field(() => String, { nullable: true })
  entschiedenVon: string | null;

  @Field(() => Date, { nullable: true })
  entschiedenAm: Date | null;

  @Field(() => String, { nullable: true })
  grund: string | null;

  @Field(() => String, { nullable: true })
  fehler: string | null;

  @Field(() => String, { nullable: true })
  ergebnisPfad: string | null;

  @Field()
  createdAt: Date;
}

@ObjectType('KiVorschlagAnnahme')
export class KiVorschlagAnnahme {
  @Field(() => KiVorschlagView)
  vorschlag: KiVorschlagView;

  @Field()
  veraltet: boolean;

  @Field(() => String, { nullable: true })
  aktuell: string | null;
}

const ergebnisPfad = (zeile: KiVorschlagEntity): string | null => {
  const ergebnis = zeile.ergebnis ?? {};
  const kennung = (schluessel: string): string | null => {
    const wert = ergebnis[schluessel] as { id?: unknown } | null | undefined;

    return typeof wert?.id === 'string' ? wert.id : null;
  };

  if (zeile.status !== 'angenommen') {
    return null;
  }

  const entwurf = kennung('draft');

  if (entwurf !== null) {
    return `/postfach?entwurf=${entwurf}#entwuerfe`;
  }

  const geschaeft = kennung('deal');

  if (geschaeft !== null) {
    return `/geschaefte/${geschaeft}`;
  }

  return zeile.zielArt === null || zeile.zielId === null
    ? null
    : `${PFAD[zeile.zielArt]}/${zeile.zielId}`;
};

const FELDART_DES_WERKZEUGS: Record<string, FeldArt | undefined> = {
  create_deal: 'deal',
  update_deal: 'deal',
  create_task: 'task',
};

export const sichtbarerStand = (
  rechte: Feldrechte,
  werkzeug: string,
  stand: Record<string, unknown> | null,
): Record<string, unknown> | null => {
  const art = FELDART_DES_WERKZEUGS[werkzeug];

  if (stand === null || art === undefined || Object.keys(rechte).length === 0) {
    return stand;
  }

  const ergebnis: Record<string, unknown> = {};

  for (const [feld, wert] of Object.entries(stand)) {
    if (feld === 'customFields') {
      ergebnis[feld] = ohneVerborgeneEigene(
        rechte,
        art,
        wert as Record<string, unknown> | null,
      );
    } else if (rechte[standardSchluessel(art, feld)] !== 'verborgen') {
      ergebnis[feld] = wert;
    }
  }

  return ergebnis;
};

export const alsAnsicht = (
  zeile: KiVorschlagEntity,
  rechte: Feldrechte,
): KiVorschlagView => ({
  id: zeile.id,
  werkzeug: zeile.werkzeug,
  zusammenfassung: zeile.zusammenfassung,
  schluesselName: zeile.schluesselName,
  zielArt: zeile.zielArt,
  zielId: zeile.zielId,
  zielName: zeile.zielName,
  zielPfad:
    zeile.zielArt === null || zeile.zielId === null
      ? null
      : `${PFAD[zeile.zielArt]}/${zeile.zielId}`,
  vorher:
    zeile.vorher === null
      ? null
      : JSON.stringify(sichtbarerStand(rechte, zeile.werkzeug, zeile.vorher)),
  nachher: JSON.stringify(
    sichtbarerStand(rechte, zeile.werkzeug, zeile.nachher ?? {}),
  ),
  status: zeile.status,
  entschiedenVon:
    zeile.entschiedenVon === null || zeile.entschiedenVon === undefined
      ? null
      : `${zeile.entschiedenVon.firstName} ${zeile.entschiedenVon.lastName}`.trim(),
  entschiedenAm: zeile.entschiedenAm,
  grund: zeile.grund,
  fehler: zeile.fehler,
  ergebnisPfad: ergebnisPfad(zeile),
  createdAt: zeile.createdAt,
});

const ARTEN: VorschlagZielArt[] = ['company', 'contact', 'deal', 'quote'];

@Resolver(() => KiVorschlagView)
@UseGuards(GqlAuthGuard, NurMenschWache)
export class KiVorschlaegeResolver {
  constructor(
    private readonly dienst: KiVorschlaegeService,
    private readonly permissions: PermissionsService,
  ) {}

  @Query(() => [KiVorschlagView])
  async kiVorschlaege(
    @CurrentUser() user: RequestUser,
    @Args('status', { type: () => [String], nullable: true })
    status?: string[],
  ): Promise<KiVorschlagView[]> {
    await this.permissions.assert(
      user,
      Permission.KI_APPROVE,
      'Vorschläge der KI zu sehen',
    );

    const gewaehlt = (status ?? ['offen']).filter(
      (eintrag): eintrag is VorschlagStatus =>
        (VORSCHLAG_STATUS as readonly string[]).includes(eintrag),
    );

    const rechte = await feldrechteJetzt();

    return (await this.dienst.liste(user, gewaehlt)).map((zeile) =>
      alsAnsicht(zeile, rechte),
    );
  }

  @Query(() => [KiVorschlagView])
  async kiVorschlaegeFuer(
    @CurrentUser() user: RequestUser,
    @Args('art') art: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<KiVorschlagView[]> {
    await this.permissions.assert(
      user,
      Permission.KI_APPROVE,
      'Vorschläge der KI zu sehen',
    );

    if (!(ARTEN as string[]).includes(art)) {
      throw new BadRequestException('Diese Art Datensatz gibt es nicht.');
    }

    const rechte = await feldrechteJetzt();

    return (
      await this.dienst.liste(user, ['offen'], {
        art: art as VorschlagZielArt,
        id,
      })
    ).map((zeile) => alsAnsicht(zeile, rechte));
  }

  @Query(() => Int)
  async offeneKiVorschlaege(@CurrentUser() user: RequestUser): Promise<number> {
    if (!(await this.permissions.can(user, Permission.KI_APPROVE))) {
      return 0;
    }

    return this.dienst.anzahlOffen(user);
  }

  @Mutation(() => KiVorschlagAnnahme)
  @UseGuards(BillingWriteGuard)
  async kiVorschlagAnnehmen(
    @CurrentUser() user: RequestUser,
    @Context('req') req: unknown,
    @Args('id', { type: () => ID }) id: string,
    @Args('trotzdem', { nullable: true }) trotzdem?: boolean,
  ): Promise<KiVorschlagAnnahme> {
    await this.permissions.assert(
      user,
      Permission.KI_APPROVE,
      'Vorschläge der KI anzunehmen',
    );

    const ergebnis = await this.dienst.annehmen(
      user,
      req,
      id,
      trotzdem === true,
    );

    const rechte = await feldrechteJetzt();

    return {
      vorschlag: alsAnsicht(ergebnis.vorschlag, rechte),
      veraltet: ergebnis.veraltet,
      aktuell:
        ergebnis.aktuell === null
          ? null
          : JSON.stringify(
              sichtbarerStand(
                rechte,
                ergebnis.vorschlag.werkzeug,
                ergebnis.aktuell,
              ),
            ),
    };
  }

  @Mutation(() => KiVorschlagView)
  @UseGuards(BillingWriteGuard)
  async kiVorschlagVerwerfen(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('grund', { type: () => String, nullable: true }) grund?: string,
  ): Promise<KiVorschlagView> {
    await this.permissions.assert(
      user,
      Permission.KI_APPROVE,
      'Vorschläge der KI zu verwerfen',
    );

    return alsAnsicht(
      await this.dienst.verwerfen(user, id, grund ?? null),
      await feldrechteJetzt(),
    );
  }
}

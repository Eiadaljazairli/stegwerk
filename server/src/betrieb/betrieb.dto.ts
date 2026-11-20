import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

import { BillingPlan, SubscriptionStatus } from '../billing/plans';

@ObjectType('BetriebZahlen')
export class BetriebZahlen {
  @Field(() => Int)
  konten: number;

  @Field(() => Int)
  bestaetigt: number;

  @Field(() => Int)
  neuDieseWoche: number;

  @Field(() => Int)
  aktivDieseWoche: number;

  @Field(() => Int)
  mitZweiFaktor: number;

  @Field(() => Int)
  offeneEinladungen: number;

  @Field(() => Int)
  arbeitsbereiche: number;

  @Field(() => Int)
  zahlend: number;

  @Field(() => Int)
  inTestphase: number;
}

@ObjectType('BetriebKonto')
export class BetriebKonto {
  @Field(() => ID)
  id: string;

  @Field()
  email: string;

  @Field()
  name: string;

  @Field()
  bestaetigt: boolean;

  @Field()
  zweiFaktor: boolean;

  @Field(() => Int)
  bereiche: number;

  @Field(() => [String])
  bereichNamen: string[];

  @Field(() => Date, { nullable: true })
  zuletztAktiv: Date | null;

  @Field()
  angelegt: Date;
}

@ObjectType('BetriebBereich')
export class BetriebBereich {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field(() => Int)
  mitglieder: number;

  @Field(() => String, { nullable: true })
  inhaber: string | null;

  @Field(() => Int)
  firmen: number;

  @Field(() => Int)
  kontakte: number;

  @Field(() => Int)
  geschaefte: number;

  @Field(() => Int)
  angebote: number;

  @Field(() => Int)
  rechnungen: number;

  @Field(() => Float)
  speicherBytes: number;

  @Field(() => Date, { nullable: true })
  zuletztAktiv: Date | null;

  @Field(() => BillingPlan, { nullable: true })
  plan: BillingPlan | null;

  @Field(() => SubscriptionStatus, { nullable: true })
  status: SubscriptionStatus | null;

  @Field(() => Date, { nullable: true })
  testphaseBis: Date | null;

  @Field(() => Date, { nullable: true })
  laeuftBis: Date | null;

  @Field()
  angelegt: Date;
}

@ObjectType('BetriebsUebersicht')
export class BetriebsUebersicht {
  @Field(() => BetriebZahlen)
  zahlen: BetriebZahlen;

  @Field(() => [BetriebKonto])
  konten: BetriebKonto[];

  @Field(() => [BetriebBereich])
  bereiche: BetriebBereich[];
}

@ObjectType('BetriebNutzung')
export class BetriebNutzung {
  @Field()
  bereich: string;

  @Field(() => Int)
  angesehen: number;

  @Field(() => Int)
  geaendert: number;

  @Field(() => Int)
  tage: number;

  @Field()
  zuletzt: string;
}

@ObjectType('BetriebTag')
export class BetriebTag {
  @Field()
  tag: string;

  @Field(() => Int)
  anzahl: number;
}

@ObjectType('BetriebAenderung')
export class BetriebAenderung {
  @Field()
  aktion: string;

  @Field()
  art: string;

  @Field()
  bereich: string;

  @Field()
  wann: Date;
}

@ObjectType('BetriebKontoDetail')
export class BetriebKontoDetail {
  @Field(() => ID)
  id: string;

  @Field()
  email: string;

  @Field()
  name: string;

  @Field()
  bestaetigt: boolean;

  @Field()
  zweiFaktor: boolean;

  @Field(() => Date, { nullable: true })
  zuletztGesehen: Date | null;

  @Field()
  angelegt: Date;

  @Field(() => [Date])
  anmeldungen: Date[];

  @Field(() => Int)
  anmeldungen30: number;

  @Field(() => [BetriebNutzung])
  nutzung: BetriebNutzung[];

  @Field(() => [BetriebTag])
  tage: BetriebTag[];

  @Field(() => [BetriebAenderung])
  aenderungen: BetriebAenderung[];
}

@ObjectType('GeplanterLauf')
export class GeplanterLauf {
  @Field()
  name: string;

  @Field()
  zustand: string;

  @Field(() => Int)
  intervallSek: number;

  @Field(() => Date, { nullable: true })
  letzterStart: Date | null;

  @Field(() => Date, { nullable: true })
  letzterErfolg: Date | null;

  @Field(() => Date, { nullable: true })
  letzterFehlerAm: Date | null;

  @Field(() => String, { nullable: true })
  letzterFehler: string | null;

  @Field(() => Int, { nullable: true })
  letzteDauerMs: number | null;

  @Field(() => Int)
  laeufe: number;

  @Field(() => Int)
  fehlerInFolge: number;
}

@ObjectType('SicherungsZustand')
export class SicherungsZustand {
  @Field()
  zustand: string;

  @Field(() => Date, { nullable: true })
  letzteSicherung: Date | null;

  @Field(() => Float, { nullable: true })
  groesseBytes: number | null;

  @Field(() => Int, { nullable: true })
  anzahl: number | null;

  @Field(() => String, { nullable: true })
  ausserHaus: string | null;

  @Field(() => Int, { nullable: true })
  kopien: number | null;

  @Field(() => String, { nullable: true })
  letzterFehler: string | null;

  @Field(() => Date, { nullable: true })
  letzterFehlerAm: Date | null;

  @Field(() => Date, { nullable: true })
  probeAm: Date | null;

  @Field(() => Boolean, { nullable: true })
  probeOk: boolean | null;

  @Field(() => Int, { nullable: true })
  probeDauerSek: number | null;

  @Field(() => String, { nullable: true })
  probeMeldung: string | null;

  @Field(() => [String])
  warnungen: string[];
}

@ObjectType('BetriebsZustand')
export class BetriebsZustand {
  @Field()
  version: string;

  @Field()
  gestartetAm: Date;

  @Field()
  datenbankOk: boolean;

  @Field(() => Int)
  datenbankMs: number;

  @Field(() => [String])
  offeneMigrationen: string[];

  @Field()
  mailVersand: string;

  @Field(() => [GeplanterLauf])
  laeufe: GeplanterLauf[];

  @Field(() => Int)
  postfaecher: number;

  @Field(() => Int)
  postfaecherMitFehler: number;

  @Field(() => Int)
  kalender: number;

  @Field(() => Int)
  kalenderMitFehler: number;

  @Field(() => Int)
  oauthWiderrufen: number;

  @Field(() => Float, { nullable: true })
  speicherFreiBytes: number | null;

  @Field(() => Float, { nullable: true })
  speicherGesamtBytes: number | null;

  @Field(() => Int)
  protokollAenderungenMonate: number;

  @Field(() => Int)
  protokollSicherheitMonate: number;

  @Field(() => SicherungsZustand)
  sicherung: SicherungsZustand;
}

@ObjectType('BetriebsHinweis')
export class BetriebsHinweis {
  @Field(() => ID, { nullable: true })
  id: string | null;

  @Field()
  text: string;

  @Field()
  von: Date;

  @Field(() => Date, { nullable: true })
  bis: Date | null;

  @Field()
  wartung: boolean;
}

import { ConfigService } from '@nestjs/config';
import { Query, Resolver } from '@nestjs/graphql';

import { privacyFacts } from '../privacy/privacy-facts';
import {
  dpaDocument,
  MASSNAHMEN_IM_PROGRAMM,
  UNTERAUFTRAG_STAND,
  weitereAuftragsverarbeiter,
} from './dpa-document';
import { DpaDocumentInfo } from './dto/dpa.dto';
import { SicherheitInfo } from './dto/sicherheit.dto';

@Resolver()
export class LegalResolver {
  constructor(private readonly configService: ConfigService) {}

  @Query(() => DpaDocumentInfo)
  dataProcessingAgreement(): DpaDocumentInfo {
    const legal = this.configService.get<Record<string, string>>('legal') ?? {};
    const name =
      legal.companyName === undefined || legal.companyName === ''
        ? null
        : `${legal.companyName}${
            legal.legalForm === undefined || legal.legalForm === ''
              ? ''
              : ` ${legal.legalForm}`
          }`;

    return dpaDocument(privacyFacts(process.env), name);
  }

  @Query(() => SicherheitInfo)
  sicherheit(): SicherheitInfo {
    const fakten = privacyFacts(process.env);

    return {
      massnahmen: MASSNAHMEN_IM_PROGRAMM,
      hosting: fakten.hosting,
      sicherung: fakten.backupDescription,
      unterauftragsverarbeiter: weitereAuftragsverarbeiter(fakten),
      unterauftragStand: UNTERAUFTRAG_STAND,
      loeschfristTage: fakten.retentionDays,
      loeschfristAktiv: fakten.retentionEnabled,
      vertragGeprueft: fakten.dpaReviewed,
    };
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isEmail } from 'class-validator';
import { type DeepPartial, Repository } from 'typeorm';

import { AuditAction, AuditLogEntity } from '../../audit/audit-log.entity';
import {
  getRequestContext,
  runWithRequestContext,
} from '../../observability/request-context';
import { internErlaubt, sichereRoheAnfrage } from '../../webhooks/webhook-ziel';
import {
  feldrechteJetzt,
  standardSchluessel,
} from '../../workspaces/feldrechte';
import { CompaniesService } from '../companies.service';
import { type CompanyEntity } from '../entities/company.entity';
import {
  type Abruf,
  abrufbar,
  AbrufFehler,
  type Anfrager,
  BILD_MAX_BYTES,
  HTML_MAX_BYTES,
  holen,
  VorgangErschoepft,
} from './abruf';
import { BereichsDrossel, Vorgang } from './drossel';
import { FirmenlogoEntity } from './firmenlogo.entity';
import {
  htmlDekodieren,
  type ImpressumDaten,
  impressumLesen,
  impressumLink,
} from './impressum';
import { bildArt, logoKandidaten } from './logo';

export const IMPRESSUM_FELDER: {
  feld: keyof ImpressumDaten | 'website';
  label: string;
  max: number;
}[] = [
  { feld: 'name', label: 'Name', max: 200 },
  { feld: 'website', label: 'Website', max: 500 },
  { feld: 'street', label: 'Straße', max: 200 },
  { feld: 'postalCode', label: 'PLZ', max: 20 },
  { feld: 'city', label: 'Stadt', max: 120 },
  { feld: 'country', label: 'Land', max: 120 },
  { feld: 'phone', label: 'Telefon', max: 50 },
  { feld: 'email', label: 'E-Mail', max: 254 },
  { feld: 'vertretung', label: 'Vertreten durch', max: 300 },
  { feld: 'registergericht', label: 'Registergericht', max: 120 },
  { feld: 'registernummer', label: 'Registernummer', max: 40 },
  { feld: 'ustIdNr', label: 'USt-IdNr.', max: 20 },
];

export type ImpressumFeldVorschau = {
  feld: string;
  label: string;
  wert: string;
  aktuell: string | null;
  uebernehmbar: boolean;
  grund: string | null;
};

export type ImpressumErgebnis = {
  quelle: string;
  felder: ImpressumFeldVorschau[];
};

export const ABRUFE_JE_STUNDE = 300;

export const ANFRAGEN_JE_VORGANG = 10;

export const VORGANG_MS = 30_000;

const ACCEPT_HTML = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5';
const ACCEPT_BILD = 'image/png,image/webp,image/x-icon,image/*;q=0.8';

const leer = (wert: unknown): boolean =>
  wert === null || wert === undefined || String(wert).trim() === '';

const USTID = /^(DE\d{9}|ATU\d{8})$/u;

@Injectable()
export class AnreicherungService {
  anfrager: Anfrager = sichereRoheAnfrage;
  erlaubeIntern = internErlaubt();
  readonly drossel = new BereichsDrossel(ABRUFE_JE_STUNDE, 60 * 60 * 1000);

  constructor(
    private readonly companies: CompaniesService,
    @InjectRepository(FirmenlogoEntity)
    private readonly logos: Repository<FirmenlogoEntity>,
  ) {}

  private startseite(firma: CompanyEntity): URL {
    const roh =
      firma.website !== null && firma.website.trim() !== ''
        ? firma.website
        : firma.domain !== null && firma.domain.trim() !== ''
          ? `https://${firma.domain}/`
          : null;

    if (roh === null) {
      throw new BadRequestException(
        'Für diese Firma ist weder eine Website noch eine Domain eingetragen.',
      );
    }

    return this.fehlerAlsMeldung(() => abrufbar(roh, this.erlaubeIntern));
  }

  private fehlerAlsMeldung<T>(tun: () => T): T {
    try {
      return tun();
    } catch (fehler) {
      if (fehler instanceof AbrufFehler) {
        throw new BadRequestException(fehler.message);
      }

      throw fehler;
    }
  }

  private vorgang(workspaceId: string): Vorgang {
    return new Vorgang(
      this.drossel,
      workspaceId,
      ANFRAGEN_JE_VORGANG,
      VORGANG_MS,
    );
  }

  private async seite(
    url: URL,
    vorgang: Vorgang,
  ): Promise<{ abruf: Abruf; html: string }> {
    const abruf = await holen(
      url,
      HTML_MAX_BYTES,
      ACCEPT_HTML,
      this.erlaubeIntern,
      this.anfrager,
      vorgang,
    );

    return { abruf, html: htmlDekodieren(abruf.bytes, abruf.typ) };
  }

  private async startseiteLesen(
    firma: CompanyEntity,
    vorgang: Vorgang,
  ): Promise<{ abruf: Abruf; html: string }> {
    const start = this.startseite(firma);

    try {
      const ergebnis = await this.seite(start, vorgang);

      if (ergebnis.abruf.status >= 400) {
        throw new AbrufFehler(
          `${start.hostname} antwortet mit Fehler ${String(ergebnis.abruf.status)}.`,
        );
      }

      return ergebnis;
    } catch (fehler) {
      if (fehler instanceof AbrufFehler) {
        throw new BadRequestException(fehler.message);
      }

      throw fehler;
    }
  }

  async impressumVorschau(
    workspaceId: string,
    companyId: string,
  ): Promise<ImpressumErgebnis> {
    const firma = await this.companies.findOne(workspaceId, companyId);

    const vorgang = this.vorgang(workspaceId);
    const start = await this.startseiteLesen(firma, vorgang);
    const link = impressumLink(start.html, start.abruf.url);
    const versuche = [
      ...(link === null ? [] : [link]),
      new URL('/impressum', start.abruf.url),
      new URL('/imprint', start.abruf.url),
    ];
    let gefunden: { url: URL; daten: ImpressumDaten } | null = null;

    for (const url of versuche) {
      if (gefunden !== null) {
        break;
      }

      try {
        const impressum = await this.seite(url, vorgang);

        if (impressum.abruf.status >= 400) {
          continue;
        }

        const daten = impressumLesen(impressum.html);

        if (Object.keys(daten).length >= 2) {
          gefunden = { url: impressum.abruf.url, daten };
        }
      } catch (fehler) {
        if (fehler instanceof VorgangErschoepft) {
          break;
        }

        if (!(fehler instanceof AbrufFehler)) {
          throw fehler;
        }
      }
    }

    if (gefunden === null) {
      const daten = impressumLesen(start.html);

      if (Object.keys(daten).length >= 2) {
        gefunden = { url: start.abruf.url, daten };
      }
    }

    if (gefunden === null) {
      throw new BadRequestException(
        `Auf ${start.abruf.url.hostname} wurde kein lesbares Impressum gefunden.`,
      );
    }

    const daten: Partial<Record<string, string>> = { ...gefunden.daten };

    if (leer(firma.website) && start.abruf.url.protocol === 'https:') {
      daten.website = start.abruf.url.origin;
    }

    return {
      quelle: gefunden.url.toString(),
      felder: await this.vorschau(firma, daten),
    };
  }

  private async vorschau(
    firma: CompanyEntity,
    daten: Partial<Record<string, string>>,
  ): Promise<ImpressumFeldVorschau[]> {
    const rechte = await feldrechteJetzt();
    const felder: ImpressumFeldVorschau[] = [];

    for (const { feld, label } of IMPRESSUM_FELDER) {
      const wert = daten[feld];

      if (wert === undefined || wert.trim() === '') {
        continue;
      }

      const aktuellRoh = (firma as unknown as Record<string, unknown>)[feld];
      const aktuell = leer(aktuellRoh) ? null : String(aktuellRoh);
      const gesperrt =
        rechte[standardSchluessel('company', feld)] !== undefined;

      felder.push({
        feld,
        label,
        wert,
        aktuell,
        uebernehmbar: aktuell === null && !gesperrt,
        grund: gesperrt
          ? 'Ihre Rolle darf dieses Feld nicht ändern.'
          : aktuell !== null
            ? 'Schon belegt; überschrieben wird nichts.'
            : null,
      });
    }

    return felder;
  }

  async uebernehmen(
    workspaceId: string,
    companyId: string,
    werte: { feld: string; wert: string }[],
  ): Promise<CompanyEntity> {
    const firma = await this.companies.findOne(workspaceId, companyId);
    const rechte = await feldrechteJetzt();
    const patch: Record<string, string> = {};

    for (const { feld, wert } of werte) {
      const regel = IMPRESSUM_FELDER.find((eintrag) => eintrag.feld === feld);
      const sauber = wert.replace(/\s+/gu, ' ').trim();

      if (regel === undefined) {
        throw new BadRequestException(
          `Das Feld „${feld}“ lässt sich nicht aus dem Impressum übernehmen.`,
        );
      }

      if (
        sauber === '' ||
        !leer((firma as unknown as Record<string, unknown>)[feld]) ||
        rechte[standardSchluessel('company', feld)] !== undefined
      ) {
        continue;
      }

      if (sauber.length > regel.max) {
        throw new BadRequestException(
          `${regel.label} ist länger als ${String(regel.max)} Zeichen.`,
        );
      }

      if (feld === 'email' && !isEmail(sauber)) {
        throw new BadRequestException(
          'Die E-Mail-Adresse aus dem Impressum ist ungültig.',
        );
      }

      if (
        feld === 'ustIdNr' &&
        !USTID.test(sauber.replace(/\s+/gu, '').toUpperCase())
      ) {
        throw new BadRequestException(
          'Die USt-IdNr. hat weder die Form DE und neun Ziffern noch ATU und acht Ziffern.',
        );
      }

      patch[feld] = sauber;
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException(
        'Nichts zu übernehmen: die gewählten Felder sind schon belegt.',
      );
    }

    return runWithRequestContext(
      {
        requestId: 'impressum',
        ...getRequestContext(),
        aenderungsHerkunft: 'impressum',
      },
      () =>
        this.companies.update(
          workspaceId,
          companyId,
          patch as DeepPartial<CompanyEntity>,
        ),
    );
  }

  async logo(
    workspaceId: string,
    companyId: string,
  ): Promise<FirmenlogoEntity | null> {
    return this.logos.findOne({ where: { workspaceId, companyId } });
  }

  async logoLaden(
    workspaceId: string,
    companyId: string,
  ): Promise<CompanyEntity> {
    const firma = await this.companies.findZumAendern(workspaceId, companyId);

    const vorgang = this.vorgang(workspaceId);
    const start = await this.startseiteLesen(firma, vorgang);

    for (const url of logoKandidaten(start.html, start.abruf.url)) {
      let abruf: Abruf;

      try {
        abruf = await holen(
          url,
          BILD_MAX_BYTES + 1,
          ACCEPT_BILD,
          this.erlaubeIntern,
          this.anfrager,
          vorgang,
        );
      } catch (fehler) {
        if (fehler instanceof VorgangErschoepft) {
          throw new BadRequestException(fehler.message);
        }

        if (fehler instanceof AbrufFehler) {
          continue;
        }

        throw fehler;
      }

      const art = bildArt(abruf.bytes);

      if (
        abruf.status !== 200 ||
        abruf.gekuerzt ||
        abruf.bytes.length > BILD_MAX_BYTES ||
        art === null
      ) {
        continue;
      }

      const vorher = await this.logo(workspaceId, companyId);

      await this.logos.manager.transaction(async (manager) => {
        await manager.upsert(
          FirmenlogoEntity,
          {
            companyId,
            workspaceId,
            bild: abruf.bytes,
            mime: art,
            quelle: abruf.url.toString().slice(0, 500),
            geholtAm: new Date(),
          },
          ['companyId'],
        );
        await this.protokolliere(manager, firma, {
          logo: [vorher === null ? null : 'vorhanden', abruf.url.hostname],
        });
      });

      return firma;
    }

    throw new BadRequestException(
      `Auf ${start.abruf.url.hostname} wurde kein passendes Logo gefunden (PNG, JPEG, GIF, WebP oder ICO bis 200 KB; SVG wird nicht übernommen).`,
    );
  }

  async logoEntfernen(
    workspaceId: string,
    companyId: string,
  ): Promise<CompanyEntity> {
    const firma = await this.companies.findZumAendern(workspaceId, companyId);

    await this.logos.manager.transaction(async (manager) => {
      const ergebnis = await manager.delete(FirmenlogoEntity, {
        workspaceId,
        companyId,
      });

      if ((ergebnis.affected ?? 0) > 0) {
        await this.protokolliere(manager, firma, {
          logo: ['vorhanden', null],
        });
      }
    });

    return firma;
  }

  private async protokolliere(
    manager: Repository<FirmenlogoEntity>['manager'],
    firma: CompanyEntity,
    changes: Record<string, [unknown, unknown]>,
  ): Promise<void> {
    const kontext = getRequestContext();

    await manager.save(AuditLogEntity, {
      workspaceId: firma.workspaceId,
      actorId: kontext?.userId ?? null,
      action: AuditAction.UPDATED,
      entityType: 'Company',
      entityId: firma.id,
      summary: firma.name.slice(0, 300),
      changes,
      requestId: kontext?.requestId ?? null,
      herkunft: 'website',
    });
  }
}

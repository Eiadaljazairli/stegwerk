import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type SendMailOptions } from 'nodemailer';

import { internErlaubt, oeffentlicherWirt } from '../webhooks/webhook-ziel';

export type Versandzugang = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passwort: string;
  zugriffstoken?: string;
};

export type Versandanhang = {
  name: string;
  mimeType: string;
  bytes: Buffer;
};

export type Versandauftrag = {
  von: string;
  vonName: string | null;
  an: string[];
  cc?: string[];
  bcc?: string[];
  anhaenge?: Versandanhang[];
  betreff: string;
  rumpf: string;
  kennung: string;
  inReplyTo: string | null;
  references: string | null;
  kopfzeilen?: Record<string, string>;
  kalender?: { methode: 'REQUEST' | 'CANCEL'; inhalt: string };
};

export const MAIL_SENDER = Symbol('MAIL_SENDER');

export interface MailSender {
  send(zugang: Versandzugang, auftrag: Versandauftrag): Promise<void>;
}

export class VersandFehlgeschlagen extends Error {
  constructor(
    grund: string,
    readonly amPostfach = false,
  ) {
    super(grund);
    this.name = 'VersandFehlgeschlagen';
  }
}

export const postfachFehler = (fehler: unknown): boolean => {
  const code = (fehler as { code?: string }).code ?? '';
  const antwort = (fehler as { responseCode?: number }).responseCode ?? 0;

  return (
    [
      'EAUTH',
      'ECONNREFUSED',
      'ENOTFOUND',
      'EHOSTUNREACH',
      'ETIMEDOUT',
      'ESOCKET',
      'ECONNECTION',
      'ETLS',
      'EDNS',
    ].includes(code) ||
    antwort === 535 ||
    antwort === 421 ||
    antwort === 454
  );
};

export const versandGrund = (fehler: unknown): string => {
  const code = (fehler as { code?: string }).code ?? '';
  const antwort = (fehler as { responseCode?: number }).responseCode ?? 0;

  if (code === 'EAUTH' || antwort === 535) {
    return 'Der Mailserver hat die Anmeldedaten des Postfachs abgelehnt.';
  }

  if (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EHOSTUNREACH'
  ) {
    return 'Der Mailserver war nicht erreichbar. Bitte Adresse und Port prüfen.';
  }

  if (code === 'ETIMEDOUT' || code === 'ESOCKET') {
    return 'Der Mailserver hat nicht rechtzeitig geantwortet.';
  }

  if (
    antwort >= 500 &&
    /\b5\.3\.4\b|\b5\.2\.3\b|message size|too large|too big|zu gro/iu.test(
      (fehler as { response?: string }).response ?? '',
    )
  ) {
    return 'Die Nachricht ist dem Mailserver zu groß. Bitte weniger oder kleinere Anhänge mitschicken.';
  }

  if (
    antwort === 553 ||
    (antwort >= 500 &&
      /SendAsDenied|\b5\.7\.60\b|sender address rejected|not owned by (the )?user|not allowed to send as|send.?as permission|sender .{0,40}not (allowed|authori[sz]ed)/iu.test(
        (fehler as { response?: string }).response ?? '',
      ))
  ) {
    return 'Der Mailserver erlaubt diese Absenderadresse nicht. Schalten Sie sie beim Anbieter frei („Senden als“) oder senden Sie mit der Hauptadresse.';
  }

  if (antwort >= 500) {
    return `Der Mailserver hat die Nachricht abgelehnt (${String(antwort)}).`;
  }

  return 'Die Nachricht konnte nicht versendet werden.';
};

export const mailOptionen = (auftrag: Versandauftrag): SendMailOptions => ({
  from:
    auftrag.vonName === null || auftrag.vonName === ''
      ? auftrag.von
      : { name: auftrag.vonName, address: auftrag.von },
  to: auftrag.an,
  ...(auftrag.cc === undefined || auftrag.cc.length === 0
    ? {}
    : { cc: auftrag.cc }),
  ...(auftrag.bcc === undefined || auftrag.bcc.length === 0
    ? {}
    : { bcc: auftrag.bcc }),
  subject: auftrag.betreff,
  text: auftrag.rumpf,
  messageId: `<${auftrag.kennung}>`,
  ...(auftrag.kopfzeilen === undefined ? {} : { headers: auftrag.kopfzeilen }),
  ...(auftrag.inReplyTo === null ? {} : { inReplyTo: auftrag.inReplyTo }),
  ...(auftrag.references === null ? {} : { references: auftrag.references }),
  ...(auftrag.kalender === undefined
    ? {}
    : {
        icalEvent: {
          method: auftrag.kalender.methode,
          filename:
            auftrag.kalender.methode === 'CANCEL'
              ? 'absage.ics'
              : 'einladung.ics',
          content: auftrag.kalender.inhalt,
        },
      }),
  ...(auftrag.anhaenge === undefined || auftrag.anhaenge.length === 0
    ? {}
    : {
        attachments: auftrag.anhaenge.map((anhang) => ({
          filename: anhang.name,
          content: anhang.bytes,
          contentType: anhang.mimeType,
        })),
      }),
});

@Injectable()
export class SmtpSender implements MailSender {
  private readonly logger = new Logger(SmtpSender.name);

  async send(zugang: Versandzugang, auftrag: Versandauftrag): Promise<void> {
    let adresse: string;

    try {
      adresse = await oeffentlicherWirt(zugang.host, internErlaubt());
    } catch (fehler) {
      throw new VersandFehlgeschlagen(
        fehler instanceof Error ? fehler.message : 'Server nicht erlaubt.',
        true,
      );
    }

    const transport = createTransport({
      host: adresse,
      port: zugang.port,
      secure: zugang.secure,
      auth:
        zugang.zugriffstoken === undefined
          ? { user: zugang.user, pass: zugang.passwort }
          : {
              type: 'OAuth2',
              user: zugang.user,
              accessToken: zugang.zugriffstoken,
            },
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      tls: {
        rejectUnauthorized: true,
        ...(adresse === zugang.host ? {} : { servername: zugang.host }),
      },
    });

    try {
      await transport.sendMail(mailOptionen(auftrag));
    } catch (fehler) {
      this.logger.warn(
        `Versand über ${zugang.host} fehlgeschlagen: ${
          fehler instanceof Error ? fehler.message : String(fehler)
        }`,
      );

      throw new VersandFehlgeschlagen(
        versandGrund(fehler),
        postfachFehler(fehler),
      );
    } finally {
      transport.close();
    }
  }
}

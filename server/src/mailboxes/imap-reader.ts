import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';

import {
  type AnhangImPostfach,
  anhaengeVon,
  type BodyNode,
  decodeText,
  htmlTeilen,
  htmlToText,
  pickTextPart,
} from './message-shape';
import {
  internErlaubt,
  oeffentlicherWirt,
  UngueltigesZiel,
} from '../webhooks/webhook-ziel';
import { kopfzeile } from './kopfzeile';
import { istMassenpost, MASSENPOST_KOPFZEILEN } from './massenpost';

export { kopfzeile } from './kopfzeile';

export type MailboxCredentials = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  folder: string;
  accessToken?: string;
  ohneGmailKategorien?: boolean;
};

export type IncomingMessage = {
  uid: number;
  messageId: string;
  from: string | null;
  to: string | null;
  cc: string | null;
  subject: string | null;
  sentAt: Date;
  inReplyTo: string | null;
  references: string | null;
  text: string;
  zitat?: string | null;
  anhaenge?: AnhangImPostfach[];
  zustellbericht?: string | null;
  kalender?: string | null;
  massenpost?: boolean;
};

export type ReadResult = {
  uidValidity: number;
  messages: IncomingMessage[];
  hoechsteUid?: number;
};

export type ReadOptions = {
  afterUid: number;
  limit: number;
};

export class MailboxUnreachableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'MailboxUnreachableError';
  }
}

export const MAIL_READER = Symbol('MAIL_READER');

export interface MailReader {
  read(
    credentials: MailboxCredentials,
    options: ReadOptions,
  ): Promise<ReadResult>;

  check(credentials: MailboxCredentials): Promise<void>;

  anhaengeLaden?(
    credentials: MailboxCredentials,
    auftraege: { messageId: string; uid?: number; teil: string }[],
    hoechstens: number,
    jeAnhang?: (schluessel: string, bytes: Buffer) => Promise<void>,
  ): Promise<Map<string, Buffer>>;
}

export const anhangSchluessel = (messageId: string, teil: string): string =>
  `${messageId}|${teil}`;

const ohneKlammern = (kennung: string): string =>
  kennung.trim().replace(/^<|>$/gu, '').toLowerCase();

const MAX_BODY_BYTES = 64 * 1024;

type FetchedRow = {
  uid: number;
  bodyStructure?: unknown;
  headers?: Buffer | Uint8Array | string;
  envelope?: {
    messageId?: string;
    subject?: string;
    date?: Date;
    inReplyTo?: string;
    from?: unknown;
    to?: unknown;
    cc?: unknown;
  };
};

const absenderAdresse = (value: unknown): string | null => {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const adresse = (value[0] as { address?: unknown }).address;

  return typeof adresse === 'string' ? adresse.toLowerCase() : null;
};

const asText = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    const joined = value
      .map((entry) => {
        const record = entry as { name?: string; address?: string };
        return record.name !== undefined && record.name !== ''
          ? `${record.name} <${record.address ?? ''}>`
          : (record.address ?? '');
      })
      .filter((entry) => entry !== '')
      .join(', ');

    return joined === '' ? null : joined;
  }

  return null;
};

@Injectable()
export class ImapReader implements MailReader {
  private readonly logger = new Logger(ImapReader.name);

  async check(credentials: MailboxCredentials): Promise<void> {
    const client = await this.clientFor(credentials);

    try {
      await client.connect();
      const lock = await client.getMailboxLock(credentials.folder, {
        readOnly: true,
      });
      lock.release();
    } catch (error) {
      throw new MailboxUnreachableError(reasonFor(error));
    } finally {
      await this.close(client);
    }
  }

  async read(
    credentials: MailboxCredentials,
    options: ReadOptions,
  ): Promise<ReadResult> {
    const client = await this.clientFor(credentials);
    const messages: IncomingMessage[] = [];
    let uidValidity = 0;
    let hoechsteUid = 0;

    try {
      await client.connect();
    } catch (error) {
      throw new MailboxUnreachableError(reasonFor(error));
    }

    try {
      const lock = await client.getMailboxLock(credentials.folder, {
        readOnly: true,
      });

      try {
        uidValidity =
          typeof client.mailbox === 'object'
            ? Number(client.mailbox.uidValidity)
            : 0;

        const range = `${String(options.afterUid + 1)}:*`;
        const auslassen =
          credentials.ohneGmailKategorien === true
            ? await gmailKategorieUids(
                client as unknown as GmailSuche,
                credentials.folder,
                options.afterUid,
              )
            : new Set<number>();

        const rows = client.fetch(
          range,
          {
            uid: true,
            envelope: true,
            bodyStructure: true,
            headers: ['references', ...MASSENPOST_KOPFZEILEN],
          },
          { uid: true },
        ) as unknown as AsyncIterable<FetchedRow>;

        for await (const message of rows) {
          if (message.uid <= options.afterUid) {
            continue;
          }

          if (messages.length >= options.limit) {
            break;
          }

          if (auslassen.has(message.uid)) {
            hoechsteUid = Math.max(hoechsteUid, message.uid);
            continue;
          }

          const envelope = message.envelope ?? {};
          const messageId = envelope.messageId;

          if (typeof messageId !== 'string' || messageId === '') {
            continue;
          }

          messages.push({
            uid: message.uid,
            messageId: messageId.slice(0, 500),
            from: asText(envelope.from),
            to: asText(envelope.to),
            cc: asText(envelope.cc),
            subject:
              typeof envelope.subject === 'string' ? envelope.subject : null,
            sentAt: envelope.date instanceof Date ? envelope.date : new Date(),
            inReplyTo:
              typeof envelope.inReplyTo === 'string' &&
              envelope.inReplyTo !== ''
                ? envelope.inReplyTo.slice(0, 500)
                : null,
            references: kopfzeile(
              message.headers === undefined ? null : String(message.headers),
              'references',
            ),
            ...(await this.bodyOf(client, message.uid, message.bodyStructure)),
            anhaenge: anhaengeVon(
              message.bodyStructure as BodyNode | undefined,
            ),
            zustellbericht: await this.berichtOf(
              client,
              message.uid,
              message.bodyStructure,
            ),
            massenpost: istMassenpost(
              message.headers === undefined ? null : String(message.headers),
              absenderAdresse(envelope.from),
            ),
            kalender: await this.kalenderOf(
              client,
              message.uid,
              message.bodyStructure,
            ),
          });
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      throw new MailboxUnreachableError(reasonFor(error));
    } finally {
      await this.close(client);
    }

    return { uidValidity, messages, hoechsteUid };
  }

  async anhaengeLaden(
    credentials: MailboxCredentials,
    auftraege: { messageId: string; uid?: number; teil: string }[],
    hoechstens: number,
    jeAnhang?: (schluessel: string, bytes: Buffer) => Promise<void>,
  ): Promise<Map<string, Buffer>> {
    const ergebnis = new Map<string, Buffer>();

    if (auftraege.length === 0) {
      return ergebnis;
    }

    const client = await this.clientFor(credentials);

    try {
      await client.connect();
    } catch (error) {
      throw new MailboxUnreachableError(reasonFor(error));
    }

    try {
      const lock = await client.getMailboxLock(credentials.folder, {
        readOnly: true,
      });

      try {
        const uids = new Map<string, number | null>();

        for (const auftrag of auftraege) {
          let uid = uids.get(auftrag.messageId);

          if (uid === undefined) {
            uid = await this.uidFuer(client, auftrag.messageId, auftrag.uid);
            uids.set(auftrag.messageId, uid);
          }

          if (uid === null) {
            continue;
          }

          const bytes = await this.teilLaden(
            client,
            uid,
            auftrag.teil,
            hoechstens,
          );

          if (bytes === null) {
            continue;
          }

          const schluessel = anhangSchluessel(auftrag.messageId, auftrag.teil);

          if (jeAnhang === undefined) {
            ergebnis.set(schluessel, bytes);
          } else {
            await jeAnhang(schluessel, bytes);
          }
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      if (error instanceof MailboxUnreachableError) {
        throw error;
      }

      throw new MailboxUnreachableError(reasonFor(error));
    } finally {
      await this.close(client);
    }

    return ergebnis;
  }

  private async uidFuer(
    client: ImapFlow,
    messageId: string,
    vermutet: number | undefined,
  ): Promise<number | null> {
    const gesucht = ohneKlammern(messageId);

    if (vermutet !== undefined && vermutet > 0) {
      const zeile = (await client.fetchOne(
        String(vermutet),
        { uid: true, envelope: true },
        { uid: true },
      )) as unknown as FetchedRow | false;

      if (
        zeile !== false &&
        typeof zeile.envelope?.messageId === 'string' &&
        ohneKlammern(zeile.envelope.messageId) === gesucht
      ) {
        return vermutet;
      }
    }

    const treffer = await client.search(
      { header: { 'message-id': gesucht } },
      { uid: true },
    );

    return Array.isArray(treffer) && treffer.length > 0 ? treffer[0] : null;
  }

  private async teilLaden(
    client: ImapFlow,
    uid: number,
    teil: string,
    hoechstens: number,
  ): Promise<Buffer | null> {
    try {
      const download = await client.download(String(uid), teil, {
        uid: true,
        maxBytes: hoechstens + 1,
      });

      if (download.content === undefined) {
        return null;
      }

      const stuecke: Buffer[] = [];
      let laenge = 0;

      for await (const stueck of download.content) {
        const puffer = Buffer.from(stueck as Buffer);

        laenge += puffer.length;

        if (laenge > hoechstens) {
          return null;
        }

        stuecke.push(puffer);
      }

      return Buffer.concat(stuecke);
    } catch (error) {
      this.logger.warn(
        `Anhang ${teil} von Nachricht ${String(uid)} nicht lesbar: ${reasonFor(error)}`,
      );

      return null;
    }
  }

  private async clientFor(credentials: MailboxCredentials): Promise<ImapFlow> {
    let adresse: string;

    try {
      adresse = await oeffentlicherWirt(credentials.host, internErlaubt());
    } catch (error) {
      throw new MailboxUnreachableError(reasonFor(error));
    }

    return new ImapFlow({
      host: adresse,
      ...(adresse === credentials.host ? {} : { servername: credentials.host }),
      port: credentials.port,
      secure: credentials.secure,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 60_000,
      auth:
        credentials.accessToken === undefined
          ? { user: credentials.username, pass: credentials.password }
          : {
              user: credentials.username,
              accessToken: credentials.accessToken,
            },
      logger: false,
      emitLogs: false,
    });
  }

  private async bodyOf(
    client: ImapFlow,
    uid: number,
    structure: unknown,
  ): Promise<{ text: string; zitat: string | null }> {
    const part = pickTextPart(
      (structure ?? { type: 'text/plain' }) as Parameters<
        typeof pickTextPart
      >[0],
    );

    if (part === null) {
      return { text: '', zitat: null };
    }

    try {
      const download = await client.download(String(uid), part.part, {
        uid: true,
        maxBytes: MAX_BODY_BYTES,
      });

      if (download.content === undefined) {
        return { text: '', zitat: null };
      }

      const chunks: Buffer[] = [];

      for await (const chunk of download.content) {
        chunks.push(Buffer.from(chunk as Buffer));
      }

      const text = decodeText(Buffer.concat(chunks), part.charset);

      if (!part.html) {
        return { text, zitat: null };
      }

      const { eigen, zitat } = htmlTeilen(text);

      return {
        text: htmlToText(eigen),
        zitat: zitat === '' ? null : htmlToText(zitat),
      };
    } catch (error) {
      this.logger.warn(
        `Text von Nachricht ${String(uid)} nicht lesbar: ${reasonFor(error)}`,
      );

      return { text: '', zitat: null };
    }
  }

  private async berichtOf(
    client: ImapFlow,
    uid: number,
    structure: unknown,
  ): Promise<string | null> {
    const teil = berichtsTeil(structure as BodyNode | undefined);

    if (teil === null) {
      return null;
    }

    try {
      const download = await client.download(String(uid), teil, {
        uid: true,
        maxBytes: 16 * 1024,
      });

      if (download.content === undefined) {
        return null;
      }

      const chunks: Buffer[] = [];

      for await (const chunk of download.content) {
        chunks.push(Buffer.from(chunk as Buffer));
      }

      return Buffer.concat(chunks).toString('utf8');
    } catch (error) {
      this.logger.warn(
        `Zustellbericht von Nachricht ${String(uid)} nicht lesbar: ${reasonFor(error)}`,
      );

      return null;
    }
  }

  private async kalenderOf(
    client: ImapFlow,
    uid: number,
    structure: unknown,
  ): Promise<string | null> {
    const teil = kalenderTeil(structure as BodyNode | undefined);

    if (teil === null) {
      return null;
    }

    try {
      const download = await client.download(String(uid), teil, {
        uid: true,
        maxBytes: 64 * 1024,
      });

      if (download.content === undefined) {
        return null;
      }

      const chunks: Buffer[] = [];

      for await (const chunk of download.content) {
        chunks.push(Buffer.from(chunk as Buffer));
      }

      return Buffer.concat(chunks).toString('utf8');
    } catch (error) {
      this.logger.warn(
        `Kalenderteil von Nachricht ${String(uid)} nicht lesbar: ${reasonFor(error)}`,
      );

      return null;
    }
  }

  private async close(client: ImapFlow): Promise<void> {
    try {
      await client.logout();
    } catch {}
  }
}

export const berichtsTeil = (wurzel: BodyNode | undefined): string | null => {
  if (
    wurzel === undefined ||
    wurzel.type.toLowerCase() !== 'multipart/report'
  ) {
    return null;
  }

  const teil = (wurzel.childNodes ?? []).find(
    (kind) =>
      kind.type.toLowerCase() === 'message/delivery-status' ||
      kind.type.toLowerCase() === 'message/global-delivery-status',
  );

  return teil?.part ?? null;
};

export const kalenderTeil = (wurzel: BodyNode | undefined): string | null => {
  if (wurzel === undefined) {
    return null;
  }

  if (wurzel.type.toLowerCase() === 'text/calendar') {
    return wurzel.part ?? '1';
  }

  for (const kind of wurzel.childNodes ?? []) {
    const gefunden = kalenderTeil(kind);

    if (gefunden !== null) {
      return gefunden;
    }
  }

  return null;
};

export type GmailSuche = {
  capabilities: Map<string, boolean | number>;
  search(
    query: { uid?: string; gmraw?: string },
    options?: { uid?: boolean },
  ): Promise<number[] | false>;
};

export const GMAIL_KATEGORIEN = [
  'promotions',
  'social',
  'forums',
  'updates',
] as const;

export const gmailKategorieUids = async (
  client: GmailSuche,
  ordner: string,
  nachUid: number,
): Promise<Set<number>> => {
  if (
    client.capabilities.get('X-GM-EXT-1') === undefined ||
    ordner.toUpperCase() !== 'INBOX'
  ) {
    return new Set();
  }

  try {
    const treffer = await client.search(
      {
        uid: `${String(nachUid + 1)}:*`,
        gmraw: GMAIL_KATEGORIEN.map((name) => `category:${name}`).join(' OR '),
      },
      { uid: true },
    );

    return new Set(treffer === false ? [] : treffer);
  } catch {
    return new Set();
  }
};

export const reasonFor = (error: unknown): string => {
  if (error instanceof UngueltigesZiel) {
    return error.message;
  }

  const message = error instanceof Error ? error.message : String(error);

  if (/auth|login|credential|password/iu.test(message)) {
    return 'Anmeldung fehlgeschlagen. Benutzername oder Passwort stimmen nicht.';
  }

  if (/enotfound|getaddrinfo|dns/iu.test(message)) {
    return 'Server nicht gefunden. Bitte den Hostnamen prüfen.';
  }

  if (/econnrefused|timeout|etimedout|econnreset/iu.test(message)) {
    return 'Keine Verbindung zum Server. Bitte Port und Verschlüsselung prüfen.';
  }

  if (/certificate|self.signed|tls|ssl/iu.test(message)) {
    return 'Das Zertifikat des Servers wurde nicht akzeptiert.';
  }

  if (/mailbox|folder|nonexistent|does not exist/iu.test(message)) {
    return 'Der Ordner wurde nicht gefunden. Bei vielen Servern heißt er INBOX.';
  }

  return 'Der Server hat die Verbindung nicht angenommen. Bitte Server, Port und Verschlüsselung prüfen.';
};

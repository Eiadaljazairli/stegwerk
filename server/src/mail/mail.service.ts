import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'fs/promises';
import { createTransport, type Transporter } from 'nodemailer';
import { join } from 'path';

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
};

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | undefined;
  private readonly outbox = join(process.cwd(), 'var', 'mail');

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const host = this.configService.get<string>('mail.host');

    if (host === undefined || host === '') {
      this.logger.warn(
        `No SMTP host configured — mail will be written to ${this.outbox}`,
      );

      return;
    }

    const port = this.configService.get<number>('mail.port') ?? 587;
    const user = this.configService.get<string>('mail.user') ?? '';
    const pass = this.configService.get<string>('mail.password') ?? '';

    this.transporter = createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: user === '' ? undefined : { user, pass },
    });

    this.logger.log(`Mail via ${host}:${port}`);
  }

  private from(): string {
    const address =
      this.configService.get<string>('mail.from') ?? 'noreply@localhost';
    const name = this.configService.get<string>('mail.fromName') ?? 'Stegwerk';

    return `${name} <${address}>`;
  }

  async send(mail: Mail): Promise<boolean> {
    try {
      if (this.transporter === undefined) {
        await this.writeToOutbox(mail);

        return true;
      }

      await this.transporter.sendMail({ from: this.from(), ...mail });

      return true;
    } catch (error) {
      this.logger.error(
        `Could not send "${mail.subject}" to ${mail.to}`,
        error instanceof Error ? error.stack : String(error),
      );

      return false;
    }
  }

  private async writeToOutbox(mail: Mail): Promise<void> {
    await mkdir(this.outbox, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = join(
      this.outbox,
      `${stamp}-${mail.to.replace(/\W/g, '_')}.eml`,
    );

    const attachments = mail.attachments ?? [];

    for (const attachment of attachments) {
      await writeFile(
        join(this.outbox, `${stamp}-${attachment.filename}`),
        attachment.content,
      );
    }

    const message = [
      `From: ${this.from()}`,
      `To: ${mail.to}`,
      `Subject: ${mail.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      ...(attachments.length === 0
        ? []
        : [
            `X-Stegwerk-Attachments: ${attachments
              .map((attachment) => attachment.filename)
              .join(', ')}`,
          ]),
      '',
      mail.text,
    ].join('\r\n');

    await writeFile(path, message, 'utf8');

    this.logger.log(`Mail written to ${path}`);
  }
}

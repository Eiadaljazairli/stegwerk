import 'reflect-metadata';

import { initialiseSentry } from './observability/sentry';

const sentryEnabled = initialiseSentry();

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { StructuredLogger } from './observability/structured.logger';
import {
  inlineScriptHashes,
  originOf,
  securityHeaders,
} from './security-headers';
import { servesInterface, vorgerenderteDatei } from './web-fallback';

const bootstrap = async () => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const config = app.get(ConfigService);

  app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

  app.useLogger(
    new StructuredLogger(config.get<string>('nodeEnv') === 'production'),
  );

  app.enableCors({
    origin: config.get<string>('webOrigin'),
    credentials: true,
  });

  const istBetrieb = config.get<string>('nodeEnv') === 'production';
  let kopfzeilen = securityHeaders({ hsts: istBetrieb });
  let kopfzeilenEinbettbar = securityHeaders({
    hsts: istBetrieb,
    einbettbar: true,
  });

  app.use((request: { url: string }, response: Response, next: () => void) => {
    const satz = request.url.startsWith('/formular/')
      ? kopfzeilenEinbettbar
      : kopfzeilen;

    for (const [name, wert] of Object.entries(satz)) {
      (
        response as unknown as { setHeader: (n: string, v: string) => void }
      ).setHeader(name, wert);
    }

    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const webRoot =
    config.get<string>('webRoot') ?? join(process.cwd(), 'web-dist');

  if (existsSync(join(webRoot, 'index.html'))) {
    const seite = {
      hsts: istBetrieb,
      scriptHashes: inlineScriptHashes(
        readFileSync(join(webRoot, 'index.html'), 'utf8'),
      ),
      connectSources: [
        originOf(process.env.SENTRY_DSN),
        ...(process.env.CSP_CONNECT_SRC ?? '')
          .split(/[\s,]+/u)
          .map((quelle) => quelle.trim())
          .filter((quelle) => quelle !== ''),
      ].filter((quelle): quelle is string => quelle !== undefined),
    };

    kopfzeilen = securityHeaders(seite);
    kopfzeilenEinbettbar = securityHeaders({ ...seite, einbettbar: true });

    app.useStaticAssets(webRoot, {
      index: false,
      redirect: false,
      setHeaders: (response, path) => {
        response.setHeader(
          'Cache-Control',
          path.endsWith('.html')
            ? 'no-store'
            : /(?:robots\.txt|sitemap\.xml)$/u.test(path)
              ? 'public, max-age=3600'
              : 'public, max-age=31536000, immutable',
        );
      },
    });

    app.use((request: Request, response: Response, next: () => void) => {
      const { method, path } = request as unknown as {
        method: string;
        path: string;
      };

      if (!servesInterface(method, path)) {
        next();
        return;
      }

      const vorgerendert = vorgerenderteDatei(path);
      const datei =
        vorgerendert !== null && existsSync(join(webRoot, vorgerendert))
          ? vorgerendert
          : 'index.html';

      (
        response as unknown as { setHeader: (k: string, v: string) => void }
      ).setHeader('Cache-Control', 'no-store');
      (response as unknown as { sendFile: (file: string) => void }).sendFile(
        join(webRoot, datei),
      );
    });

    // oxlint-disable-next-line no-console
    console.log(`Oberfläche wird mit ausgeliefert aus ${webRoot}`);
  }

  const port = config.get<number>('port') ?? 4000;

  await app.listen(port, '0.0.0.0');

  // oxlint-disable-next-line no-console
  console.log(
    sentryEnabled
      ? 'Error tracking active'
      : 'Error tracking off — no SENTRY_DSN configured',
  );

  const fehlt: string[] = [];

  if ((config.get<string>('legal.companyName') ?? '') === '') {
    fehlt.push(
      'LEGAL_* (Impressum, §5 DDG — ohne das kein gewerblicher Betrieb)',
    );
  }

  if ((config.get<string>('stripeSecretKey') ?? '') === '') {
    fehlt.push('STRIPE_SECRET_KEY (ohne Kasse keine kostenpflichtigen Pläne)');
  }

  if ((config.get<string>('mail.host') ?? '') === '') {
    fehlt.push('SMTP_HOST (ohne Mailserver kann niemand eingeladen werden)');
  }

  if (fehlt.length > 0) {
    // oxlint-disable-next-line no-console
    console.log(`Noch nicht eingerichtet: ${fehlt.join(' · ')}`);
  }

  // oxlint-disable-next-line no-console
  console.log(`Stegwerk API listening on http://localhost:${port}/graphql`);
};

void bootstrap();

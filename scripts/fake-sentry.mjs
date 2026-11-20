#!/usr/bin/env node
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 9999);
const received = [];

const summarise = (event) => {
  const exception = event.exception?.values?.[0];

  return {
    eventId: event.event_id,
    level: event.level,
    type: exception?.type,
    value: exception?.value,
    tags: event.tags,
    user: event.user,
    environment: event.environment,
    leaked: {
      cookies: event.request?.cookies !== undefined,
      headers: event.request?.headers !== undefined,
      body: event.request?.data !== undefined,
      email: /[\w.]+@[\w.]+\.\w+/.test(JSON.stringify(event)),
    },
  };
};

createServer((request, response) => {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-headers', '*');
  response.setHeader('access-control-allow-methods', 'POST, GET, OPTIONS');

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();

    return;
  }

  if (request.url === '/__received') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(received));

    return;
  }

  let body = '';
  request.on('data', (chunk) => (body += chunk));
  request.on('end', () => {
    for (const line of body.split('\n')) {
      try {
        const parsed = JSON.parse(line);

        if (parsed.exception !== undefined || parsed.message !== undefined) {
          received.push(summarise(parsed));
          // oxlint-disable-next-line no-console
          console.log(JSON.stringify(summarise(parsed), null, 2));
        }
      } catch {}
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{}');
  });
}).listen(PORT, () => {
  // oxlint-disable-next-line no-console
  console.log(`fake sentry listening on http://localhost:${PORT}`);
});

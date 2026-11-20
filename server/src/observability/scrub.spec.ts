import { type ErrorEvent } from '@sentry/nestjs';

import { type RequestContext } from './request-context';
import { scrubEvent } from './scrub';

const makeEvent = (parts: Partial<ErrorEvent>): ErrorEvent =>
  ({ type: undefined, ...parts }) as ErrorEvent;

const context: RequestContext = {
  requestId: 'req-1',
  userId: 'user-1',
  workspaceId: 'ws-1',
};

describe('scrubEvent', () => {
  it('removes cookies, headers and the request body', () => {
    const event = makeEvent({
      request: {
        cookies: { session: 'secret' },
        headers: { authorization: 'Bearer live-token' },
        data: { password: 'hunter2', email: 'kunde@example.de' },
      },
    });

    const scrubbed = scrubEvent(event, context);

    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.headers).toBeUndefined();
    expect(scrubbed.request?.data).toBeUndefined();
    expect(JSON.stringify(scrubbed)).not.toContain('live-token');
    expect(JSON.stringify(scrubbed)).not.toContain('kunde@example.de');
  });

  it('drops the query string, which carries search terms', () => {
    const event = makeEvent({
      request: { url: 'https://app.example.de/kontakte?suche=Müller+GmbH' },
    });

    expect(scrubEvent(event, context).request?.url).toBe(
      'https://app.example.de/kontakte',
    );
  });

  it('identifies the user by id alone', () => {
    const event = makeEvent({
      user: { id: 'user-1', email: 'chef@kunde.de', username: 'chef' },
    });

    expect(scrubEvent(event, context).user).toEqual({ id: 'user-1' });
  });

  it('tags the request so an issue can be traced to this server log', () => {
    const scrubbed = scrubEvent(makeEvent({}), context);

    expect(scrubbed.tags).toMatchObject({
      requestId: 'req-1',
      workspaceId: 'ws-1',
    });
  });

  it('marks a request made outside a workspace rather than dropping the tag', () => {
    const scrubbed = scrubEvent(makeEvent({}), {
      requestId: 'req-2',
      userId: 'user-2',
      workspaceId: undefined,
    });

    expect(scrubbed.tags?.workspaceId).toBe('anonymous');
  });

  it('still scrubs when there is no request context to tag with', () => {
    const event = makeEvent({
      request: { headers: { authorization: 'Bearer live-token' } },
    });

    const scrubbed = scrubEvent(event, undefined);

    expect(scrubbed.request?.headers).toBeUndefined();
    expect(scrubbed.user).toBeUndefined();
  });
});

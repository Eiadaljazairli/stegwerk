import 'reflect-metadata';

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { BegleitbelegeResolver } from '../begleitbelege/begleitbelege.resolver';
import { MailboxesResolver } from '../mailboxes/mailboxes.resolver';
import { PrivacyResolver } from '../privacy/privacy.resolver';
import { InvitationsResolver } from '../workspaces/invitations.resolver';
import { NurMenschWache } from './api-key.guard';

const NUR_PERSON: [object, string][] = [
  [PrivacyResolver, 'exportWorkspaceData'],
  [PrivacyResolver, 'deleteWorkspace'],
  [InvitationsResolver, 'acceptInvitation'],
  [BegleitbelegeResolver, 'begleitbelegAlsAnhang'],
  [MailboxesResolver, 'myMailbox'],
  [MailboxesResolver, 'connectMailbox'],
  [MailboxesResolver, 'disconnectMailbox'],
  [MailboxesResolver, 'syncMailbox'],
  [MailboxesResolver, 'sendMail'],
  [MailboxesResolver, 'setMailSichtbarkeit'],
  [MailboxesResolver, 'setPostfachEinstellungen'],
];

const wachen = (klasse: object, methode: string): unknown[] => {
  const proto = (klasse as { prototype: Record<string, unknown> }).prototype;

  return [
    ...((Reflect.getMetadata(GUARDS_METADATA, klasse) as unknown[]) ?? []),
    ...((Reflect.getMetadata(GUARDS_METADATA, proto[methode] as object) as
      | unknown[]
      | undefined) ?? []),
  ];
};

const kontext = (user: unknown): ExecutionContext =>
  ({
    getType: () => 'http',
    getArgs: () => [{ user }, {}, {}],
    getArgByIndex: (i: number) => [{ user }, {}, {}][i],
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getClass: () => Object,
    getHandler: () => () => undefined,
  }) as unknown as ExecutionContext;

describe('NurMenschWache an Operationen, die eine Person brauchen', () => {
  it.each(
    NUR_PERSON.map(([klasse, methode]) => [
      (klasse as { name: string }).name,
      methode,
      klasse,
    ]),
  )('%s.%s trägt die Wache', (_name, methode, klasse) => {
    expect(wachen(klasse as object, methode as string)).toContain(
      NurMenschWache,
    );
  });

  it('weist einen Schlüssel ab und lässt eine Person durch', () => {
    const wache = new NurMenschWache();

    expect(() =>
      wache.canActivate(
        kontext({ userId: 'k1', workspaceId: 'w1', apiKey: { id: 'k1' } }),
      ),
    ).toThrow(ForbiddenException);
    expect(
      wache.canActivate(kontext({ userId: 'u1', workspaceId: 'w1' })),
    ).toBe(true);
  });
});

import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  erzeugeReferenz,
  operationenAusResolvern,
  referenzAusRepository,
} from '../../../scripts/schema-referenz.mjs';
import gespeichert from './schema-referenz.json';
import {
  type Referenz,
  referenzSuche,
  signatur,
  typTeile,
} from './schema-referenz';

const REFERENZ = gespeichert as Referenz;
const namen = (liste: { name: string }[]) => liste.map((op) => op.name);

describe('die gespeicherte Referenz', () => {
  it('passt zum Schema und zu den Resolvern', () => {
    expect(referenzAusRepository(join(process.cwd(), '..'))).toEqual(REFERENZ);
  });

  it('nennt, was ein Programm mit Schlüssel braucht', () => {
    expect(namen(REFERENZ.abfragen)).toEqual(
      expect.arrayContaining(['companies', 'contacts', 'deals', 'invoices']),
    );
    expect(namen(REFERENZ.aenderungen)).toEqual(
      expect.arrayContaining([
        'createCompany',
        'createContact',
        'upsertContacts',
        'moveDealToStage',
      ]),
    );
  });

  it('nennt nichts, was nur ein Mensch darf oder ohne Anmeldung geht', () => {
    const alle = [...namen(REFERENZ.abfragen), ...namen(REFERENZ.aenderungen)];

    for (const verboten of [
      'createApiKey',
      'apiKeys',
      'createWebhook',
      'webhooks',
      'me',
      'switchWorkspace',
      'signIn',
      'signUp',
      'refreshToken',
      'exportWorkspaceData',
      'deleteWorkspace',
      'acceptInvitation',
      'begleitbelegAlsAnhang',
      'myMailbox',
      'connectMailbox',
      'disconnectMailbox',
      'syncMailbox',
      'sendMail',
      'setMailSichtbarkeit',
      'setPostfachEinstellungen',
    ]) {
      expect(alle).not.toContain(verboten);
    }
  });

  it('beschreibt jeden genannten Typ', () => {
    const typen = new Set(REFERENZ.typen.map((typ) => typ.name));
    const eingebaut = new Set(['String', 'Int', 'Float', 'Boolean', 'ID']);

    for (const op of [...REFERENZ.abfragen, ...REFERENZ.aenderungen]) {
      for (const typ of [op.rueckgabe, ...op.argumente.map((arg) => arg.typ)]) {
        const { name } = typTeile(typ);

        expect(eingebaut.has(name) || typen.has(name)).toBe(true);
      }
    }
  });
});

describe('operationenAusResolvern', () => {
  const resolver = `
@Resolver(() => A)
@UseGuards(GqlAuthGuard)
export class AResolver {
  @Query(() => [A])
  liste() {}

  @Mutation(() => A)
  @UseGuards(NurMenschWache, BillingWriteGuard)
  geheim() {}

  @Query(() => A, { name: 'anders' })
  async intern() {}
}

@Resolver()
@UseGuards(
  GqlAuthGuard,
  NurMenschWache,
)
export class BResolver {
  @Mutation(() => Boolean)
  menschlich() {}
}

@Resolver()
export class CResolver {
  @Mutation(() => Auth)
  @UseGuards(GqlThrottlerGuard)
  anmelden() {}

  @Query(() => A)
  @UseGuards(GqlAuthGuard)
  async mitWache() {}
}
`;
  const ops = operationenAusResolvern([resolver]);

  it('nimmt die Wache der Klasse für jede Methode', () => {
    expect(ops.get('Query.liste')).toEqual({ schluessel: true });
  });

  it('schließt aus, was NurMenschWache trägt, an Methode oder Klasse', () => {
    expect(ops.get('Mutation.geheim')).toEqual({ schluessel: false });
    expect(ops.get('Mutation.menschlich')).toEqual({ schluessel: false });
  });

  it('schließt aus, was ohne GqlAuthGuard läuft', () => {
    expect(ops.get('Mutation.anmelden')).toEqual({ schluessel: false });
    expect(ops.get('Query.mitWache')).toEqual({ schluessel: true });
  });

  it('liest den Namen aus der Option name', () => {
    expect(ops.get('Query.anders')).toEqual({ schluessel: true });
    expect(ops.has('Query.intern')).toBe(false);
  });

  it('bricht ab, wenn eine Operation keinen Resolver hat', () => {
    expect(() =>
      erzeugeReferenz('type Query { liste: Int, fehlt: Int }', [resolver]),
    ).toThrow(/Query\.fehlt/u);
  });
});

describe('Suche und Darstellung', () => {
  const klein: Referenz = {
    abfragen: [
      {
        name: 'company',
        argumente: [{ name: 'id', typ: 'ID!' }],
        rueckgabe: 'Company!',
      },
    ],
    aenderungen: [
      {
        name: 'createContact',
        argumente: [{ name: 'input', typ: 'CreateContactInput!' }],
        rueckgabe: 'Contact!',
      },
    ],
    typen: [
      {
        name: 'Contact',
        art: 'objekt',
        felder: [{ name: 'email', typ: 'String' }],
      },
    ],
  };

  it('findet über Namen, Argumente und Felder', () => {
    expect(namen(referenzSuche(klein, 'contact').aenderungen)).toEqual([
      'createContact',
    ]);
    expect(namen(referenzSuche(klein, 'email').typen)).toEqual(['Contact']);
    expect(referenzSuche(klein, 'id company').abfragen).toHaveLength(1);
    expect(referenzSuche(klein, '')).toBe(klein);
  });

  it('zerlegt Typen in Hülle und Namen', () => {
    expect(typTeile('[Contact!]!')).toEqual({
      vor: '[',
      name: 'Contact',
      nach: '!]!',
    });
    expect(typTeile('Int')).toEqual({ vor: '', name: 'Int', nach: '' });
  });

  it('schreibt die Zeile wie in einer Abfrage', () => {
    expect(signatur(klein.abfragen[0])).toBe('company(id: ID!): Company!');
    expect(
      signatur({
        name: 'tasks',
        argumente: [{ name: 'limit', typ: 'Int!', vorgabe: '50' }],
        rueckgabe: '[Task!]!',
      }),
    ).toBe('tasks(limit: Int! = 50): [Task!]!');
  });
});

import { buildSchema, parse, validate } from 'graphql';

import { abfrageGrenzen } from './abfrage-grenzen';

const schema = buildSchema(`
  type Firma { id: ID!, kontakte: [Kontakt!]! }
  type Kontakt { id: ID!, firma: Firma }
  type Query { firma: Firma }
`);

const fehler = (text: string) =>
  validate(schema, parse(text), [abfrageGrenzen({ tiefe: 4, felder: 10 })]).map(
    (eintrag) => eintrag.message,
  );

describe('abfrageGrenzen', () => {
  it('lässt eine gewöhnliche Abfrage durch', () => {
    expect(fehler('{ firma { id kontakte { id } } }')).toEqual([]);
  });

  it('hält eine zu tiefe Abfrage auf, auch über Fragmente', () => {
    expect(
      fehler(`
        { firma { ...F } }
        fragment F on Firma { kontakte { firma { kontakte { firma { id } } } } }
      `)[0],
    ).toContain('zu tief');
  });

  it('hält zu viele Felder auf, auch als Aliasse', () => {
    const aliasse = Array.from(
      { length: 12 },
      (_, i) => `a${String(i)}: firma { id }`,
    ).join(' ');

    expect(fehler(`{ ${aliasse} }`)[0]).toContain('zu viele Felder');
  });

  it('zählt __typename nicht mit', () => {
    expect(fehler('{ __typename firma { __typename id } }')).toEqual([]);
  });
});

import {
  type DocumentNode,
  type FieldNode,
  Kind,
  type OperationDefinitionNode,
} from 'graphql';

export const mitAngehefteten = <Row>(
  angeheftet: Row[],
  zeilen: Row[],
  schluessel: (zeile: Row) => string,
): { zeilen: Row[]; oben: Set<string>; ausserhalb: number } => {
  const da = new Set(zeilen.map(schluessel));
  const oben = angeheftet.filter((zeile) => !da.has(schluessel(zeile)));

  return {
    zeilen: [...oben, ...zeilen],
    oben: new Set(oben.map(schluessel)),
    ausserhalb: oben.length,
  };
};

export const anheften = <Row>(
  angeheftet: Row[],
  neu: Row,
  schluessel: (zeile: Row) => string,
): Row[] => [
  neu,
  ...angeheftet.filter((zeile) => schluessel(zeile) !== schluessel(neu)),
];

export const zeilenFragment = (
  anlage: DocumentNode,
  typ: string,
): DocumentNode => {
  const operation = anlage.definitions.find(
    (definition): definition is OperationDefinitionNode =>
      definition.kind === Kind.OPERATION_DEFINITION,
  );
  const feld = operation?.selectionSet.selections.find(
    (auswahl): auswahl is FieldNode => auswahl.kind === Kind.FIELD,
  );

  if (feld?.selectionSet === undefined) {
    throw new Error('Die Anlage gibt keinen Datensatz zurück.');
  }

  return {
    kind: Kind.DOCUMENT,
    definitions: [
      {
        kind: Kind.FRAGMENT_DEFINITION,
        name: { kind: Kind.NAME, value: `Angeheftet${typ}` },
        typeCondition: {
          kind: Kind.NAMED_TYPE,
          name: { kind: Kind.NAME, value: typ },
        },
        selectionSet: feld.selectionSet,
      },
    ],
  };
};

export const aktuelleAngeheftete = <Row>(
  angeheftet: readonly Row[],
  frisch: ReadonlyMap<Row, Row | null>,
): Row[] =>
  angeheftet.flatMap((zeile) => {
    const stand = frisch.get(zeile);

    if (stand === null) {
      return [];
    }

    return [stand ?? zeile];
  });

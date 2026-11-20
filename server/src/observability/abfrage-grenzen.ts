import {
  type ASTVisitor,
  type FragmentDefinitionNode,
  GraphQLError,
  Kind,
  type SelectionSetNode,
  type ValidationContext,
} from 'graphql';

export const abfrageGrenzen =
  (grenzen: { tiefe: number; felder: number }) =>
  (context: ValidationContext): ASTVisitor => {
    const fragmente = new Map<string, FragmentDefinitionNode>();

    for (const definition of context.getDocument().definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        fragmente.set(definition.name.value, definition);
      }
    }

    const messe = (
      auswahl: SelectionSetNode,
      ebene: number,
      unterwegs: Set<string>,
    ): { tiefe: number; felder: number } => {
      let tiefe = ebene;
      let felder = 0;

      for (const teil of auswahl.selections) {
        if (teil.kind === Kind.FIELD) {
          if (teil.name.value.startsWith('__')) {
            continue;
          }

          felder += 1;

          if (teil.selectionSet !== undefined) {
            const innen = messe(teil.selectionSet, ebene + 1, unterwegs);

            tiefe = Math.max(tiefe, innen.tiefe);
            felder += innen.felder;
          }
        } else if (teil.kind === Kind.INLINE_FRAGMENT) {
          const innen = messe(teil.selectionSet, ebene, unterwegs);

          tiefe = Math.max(tiefe, innen.tiefe);
          felder += innen.felder;
        } else {
          const name = teil.name.value;
          const fragment = fragmente.get(name);

          if (fragment === undefined || unterwegs.has(name)) {
            continue;
          }

          const innen = messe(
            fragment.selectionSet,
            ebene,
            new Set([...unterwegs, name]),
          );

          tiefe = Math.max(tiefe, innen.tiefe);
          felder += innen.felder;
        }

        if (felder > grenzen.felder) {
          break;
        }
      }

      return { tiefe, felder };
    };

    return {
      OperationDefinition(node) {
        const { tiefe, felder } = messe(node.selectionSet, 1, new Set());

        if (tiefe > grenzen.tiefe) {
          context.reportError(
            new GraphQLError(
              `Die Abfrage ist zu tief verschachtelt (${String(tiefe)} Ebenen, höchstens ${String(grenzen.tiefe)}).`,
              { nodes: [node] },
            ),
          );
        }

        if (felder > grenzen.felder) {
          context.reportError(
            new GraphQLError(
              `Die Abfrage fragt zu viele Felder ab (höchstens ${String(grenzen.felder)}).`,
              { nodes: [node] },
            ),
          );
        }
      },
    };
  };

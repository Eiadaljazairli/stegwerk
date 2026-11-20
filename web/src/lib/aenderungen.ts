import { ApolloLink } from '@apollo/client';
import { getMainDefinition } from '@apollo/client/utilities';

type Hoerer = () => void;

const hoerer = new Set<Hoerer>();

export const nachAenderung = (tun: Hoerer): (() => void) => {
  hoerer.add(tun);

  return () => {
    hoerer.delete(tun);
  };
};

export const aenderungMelden = (): void => {
  for (const tun of [...hoerer]) {
    tun();
  }
};

export const aenderungsLink = new ApolloLink((operation, forward) => {
  const definition = getMainDefinition(operation.query);
  const istAenderung =
    definition.kind === 'OperationDefinition' &&
    definition.operation === 'mutation';

  if (!istAenderung) {
    return forward(operation);
  }

  return forward(operation).map((ergebnis) => {
    if (ergebnis.errors === undefined || ergebnis.errors.length === 0) {
      aenderungMelden();
    }

    return ergebnis;
  });
});

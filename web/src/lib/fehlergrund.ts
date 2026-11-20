export const fehlergrund = (fehler: unknown): string | null => {
  const grund = (
    fehler as {
      graphQLErrors?: {
        extensions?: { originalError?: { reason?: unknown } };
      }[];
    } | null
  )?.graphQLErrors?.[0]?.extensions?.originalError?.reason;

  return typeof grund === 'string' ? grund : null;
};

export const istGrund = (fehler: unknown, grund: string): boolean =>
  fehlergrund(fehler) === grund;

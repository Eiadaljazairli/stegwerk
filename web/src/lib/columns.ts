export type NamedColumn = { key: string };

export const pickColumns = <Column extends NamedColumn>(
  available: Column[],
  chosen: string[],
): Column[] => {
  if (available.length === 0) {
    return [];
  }

  if (chosen.length === 0) {
    return available;
  }

  const wanted = new Set(chosen);
  const [anchor] = available;
  const shown = available.filter((column) => wanted.has(column.key));

  return shown.some((column) => column.key === anchor.key)
    ? shown
    : [anchor, ...shown];
};

export const toggleColumn = <Column extends NamedColumn>(
  available: Column[],
  chosen: string[],
  key: string,
): string[] => {
  const current = new Set(
    chosen.length === 0 ? available.map((column) => column.key) : chosen,
  );

  if (current.has(key)) {
    current.delete(key);
  } else {
    current.add(key);
  }

  const [anchor] = available;

  if (anchor !== undefined) {
    current.add(anchor.key);
  }

  return available
    .filter((column) => current.has(column.key))
    .map((column) => column.key);
};

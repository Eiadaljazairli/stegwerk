export const NichtSichtbar = ({ was }: { was: 'Firma' | 'Kontakt' }) => (
  <span
    className="detail-field__empty"
    title={`${was === 'Firma' ? 'Diese Firma ist' : 'Dieser Kontakt ist'} einer anderen Person zugeordnet; Ihre Rolle sieht nur die eigenen.`}
  >
    Nicht sichtbar
  </span>
);

export const verknuepft = (
  kennung: string | null | undefined,
  akte: unknown,
  was: 'Firma' | 'Kontakt',
  link: () => React.ReactNode,
  leer: React.ReactNode = '—',
): React.ReactNode => {
  if (akte !== null && akte !== undefined) {
    return link();
  }

  return kennung !== null && kennung !== undefined ? (
    <NichtSichtbar was={was} />
  ) : (
    leer
  );
};

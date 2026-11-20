import { type ReactNode, useId, useState } from 'react';

export const useFeldHinweis = (
  label: string,
  hinweis: string | null | undefined,
  immerZeigen = false,
): {
  beschreibtId: string | undefined;
  knopf: ReactNode;
  text: ReactNode;
} => {
  const id = useId();
  const [offen, setOffen] = useState(false);

  if (hinweis === null || hinweis === undefined || hinweis.trim() === '') {
    return { beschreibtId: undefined, knopf: null, text: null };
  }

  const sichtbar = offen || immerZeigen;

  return {
    beschreibtId: id,
    knopf: (
      <button
        type="button"
        className="feld-hinweis__knopf"
        aria-label={`Hinweis zu ${label}`}
        aria-expanded={sichtbar}
        aria-controls={id}
        onClick={() => setOffen(!offen)}
      >
        i
      </button>
    ),
    text: (
      <p
        id={id}
        className={
          sichtbar ? 'feld-hinweis__text' : 'feld-hinweis__text visually-hidden'
        }
      >
        {hinweis}
      </p>
    ),
  };
};

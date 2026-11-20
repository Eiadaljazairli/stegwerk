import { useEffect, useRef } from 'react';

export const ScopeDialog = ({
  title,
  consequence,
  onOne,
  onFollowing,
  onSeries,
  onCancel,
  gefaehrlich = false,
}: {
  title: string;
  consequence: string;
  onOne: () => void;
  onFollowing?: () => void;
  onSeries: () => void;
  onCancel: () => void;
  gefaehrlich?: boolean;
}): JSX.Element => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const art = gefaehrlich ? ' button--danger' : '';

  useEffect(() => {
    dialogRef.current?.showModal();
    cancelRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onCancel();
        }
      }}
    >
      <div className="dialog__body">
        <div className="dialog__title">{title}</div>
        <p className="dialog__consequence">{consequence}</p>

        <div className="dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="button button--ghost"
            onClick={onCancel}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className={`button button--ghost${art}`}
            onClick={onOne}
          >
            Nur dieser Termin
          </button>
          {onFollowing !== undefined && (
            <button
              type="button"
              className={`button button--ghost${art}`}
              onClick={onFollowing}
            >
              Dieser und alle folgenden
            </button>
          )}
          <button type="button" className={`button${art}`} onClick={onSeries}>
            Alle Termine
          </button>
        </div>
      </div>
    </dialog>
  );
};

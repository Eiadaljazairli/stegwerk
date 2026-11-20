import { type ReactNode, useEffect, useId, useRef } from 'react';
import { IconClose } from './Icons';

const ersterHalt = (dialog: HTMLDialogElement | null): HTMLElement | null =>
  dialog?.querySelector<HTMLElement>(
    '[data-autofocus], input:not([type="hidden"]):not([readonly]), select, textarea',
  ) ??
  dialog?.querySelector<HTMLElement>(
    '.dialogfenster__inhalt button, .dialogfenster__inhalt a[href]',
  ) ??
  null;

export const Dialogfenster = ({
  titel,
  onClose,
  children,
  breit = false,
}: {
  titel: string;
  onClose: () => void;
  children: ReactNode;
  breit?: boolean;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titelId = useId();

  useEffect(() => {
    const vorher =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;

    if (dialog !== null && !dialog.open) {
      dialog.showModal();
    }

    ersterHalt(dialog)?.focus();

    return () => {
      if (dialog?.open === true) {
        dialog.close();
      }

      if (vorher !== null && vorher.isConnected) {
        vorher.focus();
      }
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog?.open === true && !dialog.contains(document.activeElement)) {
      ersterHalt(dialog)?.focus();
    }
  });

  return (
    <dialog
      ref={dialogRef}
      className={
        breit ? 'dialog dialog--wide dialogfenster' : 'dialog dialogfenster'
      }
      aria-labelledby={titelId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="dialog__body">
        <div className="dialogfenster__kopf">
          <h2 id={titelId} className="dialog__title">
            {titel}
          </h2>
          <button
            type="button"
            className="button button--ghost button--small dialogfenster__zu"
            aria-label="Schließen"
            onClick={onClose}
          >
            <IconClose size={16} />
          </button>
        </div>
        <div className="dialogfenster__inhalt">{children}</div>
      </div>
    </dialog>
  );
};

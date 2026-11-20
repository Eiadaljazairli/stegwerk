import { useEffect, useRef } from 'react';

import { NEXT_STEP_LABELS, type ReminderPreview } from '../lib/types';

export const ReminderPreviewDialog = ({
  preview,
  sending,
  onCancel,
  onConfirm,
}: {
  preview: ReminderPreview;
  sending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    cancelRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="dialog dialog--wide"
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
        <div className="dialog__title">
          {NEXT_STEP_LABELS[preview.level] ?? 'Mahnung'}
        </div>
        <p className="dialog__consequence">
          {preview.to === null
            ? 'Es ist keine E-Mail-Adresse hinterlegt. Tragen Sie beim Ansprechpartner eine ein.'
            : `Geht an ${preview.to}. Die Rechnung liegt als PDF bei.`}
        </p>

        <div className="field">
          <label htmlFor="reminder-subject">Betreff</label>
          <input id="reminder-subject" value={preview.subject} readOnly />
        </div>

        <div className="field">
          <label htmlFor="reminder-body">Text</label>
          <textarea
            id="reminder-body"
            className="reminder__body"
            rows={16}
            value={preview.body}
            readOnly
          />
        </div>

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
            className="button"
            disabled={sending || preview.to === null}
            onClick={onConfirm}
          >
            {sending ? 'Wird verschickt…' : 'Jetzt verschicken'}
          </button>
        </div>
      </div>
    </dialog>
  );
};

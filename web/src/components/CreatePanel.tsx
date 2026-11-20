import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

export type CreateState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  panelId: string;
};

export const useCreate = (): CreateState => {
  const [open, setOpen] = useState(() =>
    new URLSearchParams(window.location.search).has('neu'),
  );
  const panelId = useId();

  return { open, setOpen, panelId };
};

export const CreateButton = ({
  create,
  label,
}: {
  create: CreateState;
  label: string;
}) => (
  <button
    type="button"
    className={
      create.open
        ? 'button button--ghost create__toggle is-open'
        : 'button create__toggle'
    }
    aria-expanded={create.open}
    aria-controls={create.panelId}
    onClick={() => create.setOpen(!create.open)}
  >
    <span className="create__toggle-icon" aria-hidden="true">
      +
    </span>
    {label}
  </button>
);

export const CreatePanel = ({
  create,
  submitLabel,
  submitting = false,
  onSubmit,
  children,
}: {
  create: CreateState;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: () => Promise<boolean>;
  children: ReactNode;
}) => {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (create.open) {
      formRef.current
        ?.querySelector<HTMLElement>('input, select, textarea')
        ?.focus();
    }
  }, [create.open]);

  if (!create.open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (await onSubmit()) {
      create.setOpen(false);
    }
  };

  return (
    <form
      id={create.panelId}
      ref={formRef}
      className="create__panel"
      onSubmit={handleSubmit}
    >
      <div className="form-row">{children}</div>
      <div className="create__actions">
        <button className="button" type="submit" disabled={submitting}>
          {submitLabel}
        </button>
        <button
          className="button button--ghost"
          type="button"
          onClick={() => create.setOpen(false)}
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
};

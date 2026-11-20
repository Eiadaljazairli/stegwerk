import { useMutation, useQuery } from '@apollo/client';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import {
  SET_TASK_STATUS,
  UPDATE_TASK,
  WORKSPACE_MEMBERS,
} from '../lib/queries';
import {
  AUFGABEN_STATUS_LABEL,
  type AufgabenStatus,
  type CustomFieldValues,
  type Membership,
  type Task,
} from '../lib/types';
import { AktenVerknuepfungen } from './AktenVerknuepfungen';
import { AttachmentsSection } from './AttachmentsSection';
import { CustomFieldsSection } from './CustomFieldsSection';
import { TextEditor } from './TextEditor';

type TaskEditorProps = {
  task: Task;
  onClose: () => void;
  onSaved: () => void;
};

export const TaskEditor = ({ task, onClose, onSaved }: TaskEditorProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const { data } = useQuery<{ workspaceMembers: Membership[] }>(
    WORKSPACE_MEMBERS,
  );
  const [updateTask, { loading, error }] = useMutation<{
    updateTask: Task;
  }>(UPDATE_TASK);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [dueTime, setDueTime] = useState(task.dueTime ?? '');
  const [status, setStatus] = useState<AufgabenStatus>(
    task.status ?? (task.completedAt === null ? 'offen' : 'erledigt'),
  );
  const [setTaskStatus] = useMutation(SET_TASK_STATUS);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId);

  const [customFields, setCustomFields] = useState<CustomFieldValues>(
    (task.customFields ?? {}) as CustomFieldValues,
  );

  const [akten, setAkten] = useState<Task>(task);
  const [verknuepfen] = useMutation<{ updateTask: Task }>(UPDATE_TASK);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();

    if (title.trim() === '') {
      return;
    }

    const result = await updateTask({
      variables: {
        input: {
          id: task.id,
          title: title.trim(),
          description: description.trim() === '' ? null : description.trim(),
          dueDate: dueDate === '' ? null : dueDate,
          dueTime: dueDate === '' || dueTime === '' ? null : dueTime,
          assigneeId,
        },
      },
    }).catch(() => null);

    if (
      result?.data != null &&
      status !==
        (task.status ?? (task.completedAt === null ? 'offen' : 'erledigt'))
    ) {
      await setTaskStatus({ variables: { id: task.id, status } }).catch(
        () => null,
      );
    }

    if (result?.data != null) {
      onSaved();
      onClose();
    }
  };

  const saveCustomField = async (key: string, value: string) => {
    const result = await updateTask({
      variables: {
        input: {
          id: task.id,
          customFields: { [key]: value.trim() === '' ? null : value },
        },
      },
    }).catch(() => null);

    const saved = result?.data?.updateTask?.customFields;

    if (saved !== undefined) {
      setCustomFields(saved as CustomFieldValues);
    }

    onSaved();
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog dialog--wide"
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
        <div className="dialog__title">Aufgabe bearbeiten</div>

        {error !== undefined && (
          <div className="error-banner">{error.message}</div>
        )}

        <form className="auth__form" onSubmit={save}>
          <div className="field">
            <label htmlFor="task-title">Titel</label>
            <input
              id="task-title"
              required
              autoFocus
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="task-description">Beschreibung</label>
            <TextEditor
              id="task-description"
              label="Beschreibung"
              rows={4}
              value={description}
              onChange={setDescription}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="task-due">Fällig am</label>
              <input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="task-due-time">Uhrzeit</label>
              <input
                id="task-due-time"
                type="time"
                value={dueTime}
                disabled={dueDate === ''}
                onChange={(event) => setDueTime(event.target.value)}
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="task-status">Status</label>
              <select
                id="task-status"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as AufgabenStatus)
                }
              >
                {(Object.keys(AUFGABEN_STATUS_LABEL) as AufgabenStatus[]).map(
                  (wert) => (
                    <option key={wert} value={wert}>
                      {AUFGABEN_STATUS_LABEL[wert]}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="field">
              <label htmlFor="task-assignee">Zuständig</label>
              <select
                id="task-assignee"
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
              >
                {(data?.workspaceMembers ?? []).map((membership) => (
                  <option key={membership.user.id} value={membership.user.id}>
                    {membership.user.firstName} {membership.user.lastName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="dialog__actions">
            <button
              type="button"
              className="button button--ghost"
              onClick={onClose}
            >
              Abbrechen
            </button>
            <button className="button" type="submit" disabled={loading}>
              Speichern
            </button>
          </div>
        </form>

        <section className="verknuepft-abschnitt" aria-label="Verknüpfte Akten">
          <h3 className="verknuepft-abschnitt__titel">Verknüpft mit</h3>
          {akten.company === null &&
            akten.contact === null &&
            akten.deal === null &&
            akten.companyId == null &&
            akten.contactId == null &&
            akten.dealId == null && (
              <p className="related__empty">Noch mit keiner Akte verknüpft.</p>
            )}
          <AktenVerknuepfungen
            eintrag={akten}
            mindestensEine={false}
            onSetzen={async (spalte, id) => {
              const result = await verknuepfen({
                variables: { input: { id: task.id, [spalte]: id } },
              });

              if (result.data != null) {
                setAkten(result.data.updateTask);
              }

              onSaved();
            }}
          />
        </section>

        <CustomFieldsSection
          entity="TASK"
          values={customFields}
          onSave={saveCustomField}
        />

        <AttachmentsSection ziel={{ taskId: task.id }} />
      </div>
    </dialog>
  );
};

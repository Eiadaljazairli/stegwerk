import { useMutation } from '@apollo/client';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  CREATE_TASK,
  DELETE_TASK,
  SET_TASK_COMPLETED,
  SET_TASK_STATUS,
} from '../lib/queries';
import { usePapierkorb } from '../lib/usePapierkorb';
import { formatFaellig, type Task, taskLink } from '../lib/types';
import { TaskEditor } from './TaskEditor';

type TaskListProps = {
  tasks: Task[];
  target?: { companyId?: string; contactId?: string; dealId?: string };
  onChanged: () => void;
  showLinkedRecord?: boolean;
  emptyMessage?: string;
};

export const TaskList = ({
  tasks,
  target,
  onChanged,
  showLinkedRecord = true,
  emptyMessage = 'Keine Aufgaben.',
}: TaskListProps) => {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);

  const [createTask, { loading: creating, error }] = useMutation(CREATE_TASK);
  const [setTaskCompleted] = useMutation(SET_TASK_COMPLETED);
  const [setTaskStatus] = useMutation(SET_TASK_STATUS);
  const loeschen = usePapierkorb('AUFGABE', DELETE_TASK, onChanged);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (title.trim() === '') {
      return;
    }

    const result = await createTask({
      variables: {
        input: {
          title: title.trim(),
          ...(dueDate === '' ? {} : { dueDate }),
          ...(target ?? {}),
        },
      },
    }).catch(() => null);

    if (result?.data !== undefined && result.data !== null) {
      setTitle('');
      setDueDate('');
      onChanged();
    }
  };

  const toggle = async (task: Task) => {
    await setTaskCompleted({
      variables: { id: task.id, completed: task.completedAt === null },
    }).catch(() => null);
    onChanged();
  };

  const umschaltenInArbeit = async (task: Task) => {
    await setTaskStatus({
      variables: {
        id: task.id,
        status: task.status === 'in_arbeit' ? 'offen' : 'in_arbeit',
      },
    }).catch(() => null);
    onChanged();
  };

  const remove = async (id: string, titel?: string) => {
    await loeschen(id, titel);
  };

  return (
    <div className="tasks">
      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}

      {target !== undefined && (
        <form className="tasks__form" onSubmit={handleSubmit}>
          <input
            className="tasks__title-input"
            aria-label="Neue Aufgabe"
            placeholder="Aufgabe hinzufügen…"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <input
            type="date"
            aria-label="Fällig am"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
          <button
            className="button"
            type="submit"
            disabled={creating || title.trim() === ''}
          >
            Anlegen
          </button>
        </form>
      )}

      {tasks.length === 0 ? (
        <p className="notes__empty">{emptyMessage}</p>
      ) : (
        <ul className="tasks__list">
          {tasks.map((task) => {
            const link = taskLink(task);
            const isDone = task.completedAt !== null;

            return (
              <li
                key={task.id}
                className={
                  isDone
                    ? 'tasks__item is-done'
                    : task.isOverdue
                      ? 'tasks__item is-overdue'
                      : 'tasks__item'
                }
              >
                <input
                  type="checkbox"
                  className="tasks__checkbox"
                  checked={isDone}
                  onChange={() => void toggle(task)}
                  aria-label={`${task.title} als erledigt markieren`}
                />

                <div className="tasks__body">
                  <button
                    type="button"
                    className="tasks__title tasks__title--button"
                    onClick={() => setEditing(task)}
                  >
                    {task.title}
                  </button>
                  <div className="tasks__meta">
                    {task.dueDate !== null && (
                      <span
                        className={
                          task.isOverdue
                            ? 'tasks__due is-overdue'
                            : 'tasks__due'
                        }
                      >
                        {task.isOverdue ? 'Überfällig: ' : 'Fällig: '}
                        {formatFaellig(task)}
                      </span>
                    )}
                    {task.status === 'in_arbeit' && (
                      <span className="badge tasks__in-arbeit">In Arbeit</span>
                    )}
                    {showLinkedRecord && link !== null && (
                      <Link to={link.to}>{link.label}</Link>
                    )}
                    <span className="tasks__assignee">{task.assigneeName}</span>
                  </div>
                </div>

                {!isDone && showLinkedRecord && (
                  <button
                    type="button"
                    className="button button--ghost row-action"
                    onClick={() => void umschaltenInArbeit(task)}
                  >
                    {task.status === 'in_arbeit' ? 'Zurückstellen' : 'Beginnen'}
                  </button>
                )}
                <button
                  type="button"
                  className="button button--danger row-action"
                  onClick={() => void remove(task.id, task.title)}
                >
                  Löschen
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing !== null && (
        <TaskEditor
          task={editing}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      )}
    </div>
  );
};

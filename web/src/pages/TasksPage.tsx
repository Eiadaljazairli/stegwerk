import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  CreateButton,
  CreatePanel,
  useCreate,
} from '../components/CreatePanel';
import { IconTasks } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { LoadingAnnouncement, SkeletonList } from '../components/Skeleton';
import { Pagination, SearchInput } from '../components/ListControls';
import { TaskEditor } from '../components/TaskEditor';
import { TaskList } from '../components/TaskList';
import { useAuth } from '../lib/auth';
import {
  CREATE_TASK,
  SET_TASK_STATUS,
  TASK,
  TASKS,
  UPDATE_TASK,
  WORKSPACE_SUMMARY,
} from '../lib/queries';
import { formatDate, type Task } from '../lib/types';
import { useListControls } from '../lib/useListControls';
import { usePermissions } from '../lib/usePermissions';
import { geltendesFeld, wahlZumSpeichern } from '../lib/darstellung';
import {
  DarstellungSchalter,
  DarstellungsFeldWahl,
  STANDARD_DATUM,
  STANDARD_GRUPPE,
  useDarstellung,
  useDarstellungsFelder,
} from '../components/Darstellung';
import {
  ListenBoard,
  ListenKalender,
  OhneFeld,
} from '../components/KartenAnsicht';
import { SavedViews } from '../components/SavedViews';
import {
  aufgabenStandFilter,
  istView,
  type View,
  VIEWS,
} from '../lib/aufgabenStand';
import { useBezeichnung } from '../lib/useBezeichnung';
import { Werkzeugleiste } from '../components/Werkzeugleiste';

type TasksData = {
  tasks: { items: Task[]; totalCount: number; hasMore: boolean };
};

export const TasksPage = () => {
  const bez = useBezeichnung();
  const { session } = useAuth();
  const [view, setView] = useState<View>('open');
  const [mineOnly, setMineOnly] = useState(true);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const create = useCreate();
  const controls = useListControls('dueDate');
  const [params, setParams] = useSearchParams();
  const verlinkt = params.get('aufgabe');
  const { data: verlinktDaten, error: verlinktFehler } = useQuery<{
    task: Task;
  }>(TASK, { variables: { id: verlinkt }, skip: verlinkt === null });
  const verlinktSchliessen = () => {
    const neu = new URLSearchParams(params);

    neu.delete('aufgabe');
    setParams(neu, { replace: true });
  };

  const [darstellung, setzeDarstellung] = useDarstellung('tasks');
  const istListe = darstellung.art === 'liste';
  const nurMeine = mineOnly ? (session?.user.id ?? null) : null;

  const standFilter = aufgabenStandFilter(darstellung.art, view);
  const { data, loading, error, refetch } = useQuery<TasksData>(TASKS, {
    variables: {
      ...controls.variables,
      ...standFilter,
      assigneeId: nurMeine,
    },
  });

  const rechte = usePermissions();
  const darstellungsFelder = useDarstellungsFelder('TASK');
  const boardKey = geltendesFeld(
    darstellung.gruppenFeld,
    STANDARD_GRUPPE.TASK,
    darstellungsFelder.boardFelder,
  );
  const boardFeld = darstellungsFelder.boardFelder.find(
    (feld) => feld.key === boardKey,
  );
  const datumKey = geltendesFeld(
    darstellung.datumFeld,
    STANDARD_DATUM.TASK,
    darstellungsFelder.datumFelder,
  );
  const datumFeld = darstellungsFelder.datumFelder.find(
    (feld) => feld.key === datumKey,
  );
  const kartenRefetch = [TASKS, WORKSPACE_SUMMARY];
  const [updateTask] = useMutation(UPDATE_TASK, {
    refetchQueries: kartenRefetch,
  });
  const [setTaskStatus] = useMutation(SET_TASK_STATUS, {
    refetchQueries: kartenRefetch,
  });
  const kartenGemeinsam = {
    kennung: 'aufgaben',
    query: TASKS,
    variablen: {
      ...controls.variables,
      ...standFilter,
      assigneeId: nurMeine,
    },
    seite: (daten: TasksData) => daten.tasks,
    titel: (task: Task) => task.title,
    link: (task: Task) => `/aufgaben?aufgabe=${task.id}`,
    inhalt: (task: Task) => (
      <div className="board__card-feld">
        <span>
          {[
            task.dueDate === null
              ? null
              : `${task.isOverdue ? 'Überfällig' : 'Fällig'}: ${formatDate(task.dueDate)}`,
            task.assigneeName,
          ]
            .filter((teil) => teil !== null && teil !== '')
            .join(' · ')}
        </span>
      </div>
    ),
    speichern: (task: Task, aenderung: Record<string, unknown>) =>
      updateTask({ variables: { input: { id: task.id, ...aenderung } } }),
    mehrzahl: 'Aufgaben',
  };

  const [createTask, { loading: creating, error: createError }] = useMutation(
    CREATE_TASK,
    { refetchQueries: [TASKS, WORKSPACE_SUMMARY] },
  );

  const handleCreate = async (): Promise<boolean> => {
    if (title.trim() === '') {
      return false;
    }

    const result = await createTask({
      variables: {
        input: {
          title: title.trim(),
          ...(dueDate === '' ? {} : { dueDate }),
          ...(dueDate === '' || dueTime === '' ? {} : { dueTime }),
        },
      },
    }).catch(() => null);

    if (result?.data === undefined || result.data === null) {
      return false;
    }

    setTitle('');
    setDueDate('');
    setDueTime('');

    return true;
  };

  const page = data?.tasks;

  return (
    <>
      <ObjectHeader
        hilfe="aufgaben"
        kind="task"
        icon={IconTasks}
        label={bez('AUFGABE', 'mehrzahl')}
        anzahl={page?.totalCount ?? 0}
        actions={
          <>
            <DarstellungSchalter
              wert={darstellung.art}
              onChange={(art) => setzeDarstellung({ art })}
            />
            <CreateButton create={create} label={bez('AUFGABE', 'neu')} />
          </>
        }
      />

      {createError !== undefined && (
        <div className="error-banner">{createError.message}</div>
      )}

      <CreatePanel
        create={create}
        submitLabel={`${bez('AUFGABE')} anlegen`}
        submitting={creating}
        onSubmit={handleCreate}
      >
        <div className="field" style={{ flex: 1, minWidth: 240 }}>
          <label htmlFor="task-title">{bez('AUFGABE')}</label>
          <input
            id="task-title"
            required
            placeholder="z. B. Angebot nachfassen"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
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
      </CreatePanel>

      <Werkzeugleiste>
        <SearchInput
          value={controls.search}
          onChange={controls.setSearch}
          placeholder={`${bez('AUFGABE', 'mehrzahl')} durchsuchen…`}
        />

        {istListe && (
          <div className="segmented" role="group" aria-label="Ansicht">
            {VIEWS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  view === option.value
                    ? 'segmented__item is-active'
                    : 'segmented__item'
                }
                onClick={() => {
                  setView(option.value);
                  controls.goToPage(0);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(event) => {
              setMineOnly(event.target.checked);
              controls.goToPage(0);
            }}
          />
          Nur meine
        </label>

        {darstellung.art === 'board' && (
          <DarstellungsFeldWahl
            art="board"
            felder={darstellungsFelder.boardFelder}
            wert={boardKey}
            standard={STANDARD_GRUPPE.TASK}
            onChange={(gruppenFeld) => setzeDarstellung({ gruppenFeld })}
          />
        )}
        {darstellung.art === 'kalender' && (
          <DarstellungsFeldWahl
            art="kalender"
            felder={darstellungsFelder.datumFelder}
            wert={datumKey}
            standard={STANDARD_DATUM.TASK}
            onChange={(datumFeld) => setzeDarstellung({ datumFeld })}
          />
        )}

        <div className="toolbar__ansicht">
          <SavedViews
            entity="TASK"
            controls={controls}
            filters={{ ansicht: view, nurMeine: mineOnly }}
            onApplyFilters={(next) => {
              setView(istView(next.ansicht) ? next.ansicht : 'open');
              setMineOnly(next.nurMeine !== false);
            }}
            darstellung={{
              wahl: wahlZumSpeichern(darstellung, darstellungsFelder),
              setzen: setzeDarstellung,
            }}
          />
        </div>
      </Werkzeugleiste>

      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}

      {verlinkt !== null && verlinktFehler !== undefined && (
        <div className="error-banner">
          Diese Aufgabe gibt es nicht mehr, oder Sie dürfen sie nicht sehen.
        </div>
      )}

      {verlinkt !== null && verlinktDaten?.task !== undefined && (
        <TaskEditor
          task={verlinktDaten.task}
          onClose={verlinktSchliessen}
          onSaved={() => void refetch()}
        />
      )}

      {darstellung.art === 'board' ? (
        boardFeld === undefined ? (
          darstellungsFelder.geladen && <OhneFeld art="board" />
        ) : (
          <ListenBoard<Task, TasksData>
            {...kartenGemeinsam}
            key={boardFeld.key}
            feld={boardFeld}
            darfAendern={
              rechte.can('task:write') &&
              darstellungsFelder.aenderbar(boardFeld.key)
            }
            sonderweg={
              boardFeld.key === 'std:status'
                ? (task, wert) =>
                    setTaskStatus({
                      variables: { id: task.id, status: wert ?? 'offen' },
                    })
                : undefined
            }
          />
        )
      ) : darstellung.art === 'kalender' ? (
        datumFeld === undefined ? (
          darstellungsFelder.geladen && <OhneFeld art="kalender" />
        ) : (
          <ListenKalender<Task, TasksData>
            {...kartenGemeinsam}
            feld={datumFeld}
            kartenKlasse={(task) =>
              task.completedAt !== null
                ? 'is-done'
                : task.isOverdue
                  ? 'is-overdue'
                  : undefined
            }
            darfAendern={
              rechte.can('task:write') &&
              darstellungsFelder.aenderbar(datumFeld.key)
            }
          />
        )
      ) : loading && page === undefined ? (
        <>
          <LoadingAnnouncement />
          <SkeletonList />
        </>
      ) : (
        <>
          <TaskList
            tasks={page?.items ?? []}
            onChanged={() => void refetch()}
            emptyMessage={
              view === 'overdue'
                ? 'Nichts überfällig.'
                : view === 'done'
                  ? 'Noch nichts erledigt.'
                  : `Keine offenen ${bez('AUFGABE', 'mehrzahl')}.`
            }
          />

          <Pagination
            controls={controls}
            totalCount={page?.totalCount ?? 0}
            hasMore={page?.hasMore ?? false}
          />
        </>
      )}
    </>
  );
};

import { useMutation, useQuery } from '@apollo/client';

import { useAuth } from '../lib/auth';
import { MY_WORKSPACES, SWITCH_WORKSPACE } from '../lib/queries';
import { type StoredSession } from '../lib/session';
import { type WorkspaceMembership } from '../lib/types';
import { useWorkspaceName } from '../lib/useWorkspaceName';

export const WorkspaceSwitcher = () => {
  const { session, startSession } = useAuth();
  const workspaceName = useWorkspaceName();

  const { data } = useQuery<{ myWorkspaces: WorkspaceMembership[] }>(
    MY_WORKSPACES,
  );
  const [switchWorkspace] = useMutation<{ switchWorkspace: StoredSession }>(
    SWITCH_WORKSPACE,
  );

  const memberships = data?.myWorkspaces ?? [];

  if (memberships.length < 2) {
    return <div className="shell__workspace">{workspaceName}</div>;
  }

  const handleSwitch = async (workspaceId: string) => {
    if (workspaceId === session?.workspace.id) {
      return;
    }

    const result = await switchWorkspace({
      variables: { workspaceId },
    }).catch(() => null);

    if (result?.data?.switchWorkspace !== undefined) {
      startSession(result.data.switchWorkspace);
      window.location.assign('/');
    }
  };

  return (
    <select
      className="shell__workspace-select"
      aria-label="Arbeitsbereich wechseln"
      value={session?.workspace.id ?? ''}
      onChange={(event) => void handleSwitch(event.target.value)}
    >
      {memberships.map((membership) => (
        <option key={membership.workspace.id} value={membership.workspace.id}>
          {membership.workspace.name}
        </option>
      ))}
    </select>
  );
};

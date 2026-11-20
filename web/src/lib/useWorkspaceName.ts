import { useQuery } from '@apollo/client';

import { useAuth } from './auth';
import { MY_WORKSPACES } from './queries';
import { type WorkspaceMembership } from './types';

export const useWorkspaceName = (): string => {
  const { session } = useAuth();
  const { data } = useQuery<{ myWorkspaces: WorkspaceMembership[] }>(
    MY_WORKSPACES,
  );

  const current = data?.myWorkspaces.find(
    (membership) => membership.workspace.id === session?.workspace.id,
  );

  return current?.workspace.name ?? session?.workspace.name ?? '';
};

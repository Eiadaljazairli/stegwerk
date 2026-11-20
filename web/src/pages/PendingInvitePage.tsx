import { Navigate, useParams } from 'react-router-dom';

import { rememberPendingInvite } from '../lib/session';

export const PendingInvitePage = () => {
  const { token = '' } = useParams();

  if (token !== '') {
    rememberPendingInvite(token);
  }

  return <Navigate to="/anmelden" replace />;
};

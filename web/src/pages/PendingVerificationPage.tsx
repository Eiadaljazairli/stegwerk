import { Navigate, useParams } from 'react-router-dom';

import { rememberPendingVerification } from '../lib/session';

export const PendingVerificationPage = () => {
  const { token = '' } = useParams();

  if (token !== '') {
    rememberPendingVerification(token);
  }

  return <Navigate to="/anmelden" replace />;
};

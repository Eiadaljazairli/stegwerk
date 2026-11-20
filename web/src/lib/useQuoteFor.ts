import { useMutation } from '@apollo/client';
import { useNavigate } from 'react-router-dom';

import { CREATE_QUOTE, QUOTES } from './queries';

export const useQuoteFor = () => {
  const navigate = useNavigate();
  const [createQuote] = useMutation<{ createQuote: { id: string } }>(
    CREATE_QUOTE,
    { refetchQueries: [QUOTES] },
  );

  return async (input: {
    companyId?: string;
    contactId?: string;
    dealId?: string;
  }) => {
    const result = await createQuote({ variables: { input } }).catch(
      () => null,
    );
    const created = result?.data?.createQuote;

    if (created !== undefined && created !== null) {
      navigate(`/angebote/${created.id}`);
    }
  };
};

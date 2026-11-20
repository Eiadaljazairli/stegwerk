import { useQuery } from '@apollo/client';

import { CUSTOM_FIELDS } from '../lib/queries';
import { type CustomField } from '../lib/types';

export const useCustomFieldColumns = (entity: CustomField['entity']) => {
  const { data } = useQuery<{ customFields: CustomField[] }>(CUSTOM_FIELDS, {
    variables: { entity },
  });

  return (data?.customFields ?? []).filter(
    (field) => field.gegenseite !== true,
  );
};

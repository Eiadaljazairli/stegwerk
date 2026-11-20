import { readToken } from './session';

export const API_ROOT = (
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'http://localhost:4000/graphql'
).replace(/\/graphql\/?$/u, '');

const nameFrom = (disposition: string | null, fallback: string): string => {
  const kopf = disposition ?? '';
  const kodiert = /filename\*=UTF-8''([^;]+)/iu.exec(kopf);

  if (kodiert !== null) {
    try {
      return decodeURIComponent(kodiert[1]);
    } catch {}
  }

  const named = /filename="([^"]+)"/u.exec(kopf);

  return named === null ? fallback : named[1];
};

export const fetchFromApi = async (
  path: string,
  notFoundMessage = 'Das ist nicht mehr da.',
): Promise<Response> => {
  const token = readToken();

  const response = await fetch(`${API_ROOT}${path}`, {
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const said = await response
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);

    throw new Error(
      said ??
        (response.status === 404
          ? notFoundMessage
          : 'Die Datei konnte nicht erstellt werden.'),
    );
  }

  return response;
};

export const downloadFromApi = async (
  path: string,
  fallbackName: string,
  notFoundMessage = 'Das ist nicht mehr da.',
): Promise<void> => {
  const response = await fetchFromApi(path, notFoundMessage);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = nameFrom(
    response.headers.get('content-disposition'),
    fallbackName,
  );
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadQuotePdf = (
  quoteId: string,
  fallbackName: string,
): Promise<void> =>
  downloadFromApi(
    `/quotes/${quoteId}/pdf`,
    fallbackName,
    'Dieses Angebot wurde nicht gefunden.',
  );

export const downloadBegleitbelegPdf = (
  belegId: string,
  fallbackName: string,
): Promise<void> =>
  downloadFromApi(
    `/begleitbelege/${belegId}/pdf`,
    fallbackName,
    'Dieser Beleg wurde nicht gefunden.',
  );

export const downloadInvoicePdf = (
  invoiceId: string,
  fallbackName: string,
): Promise<void> =>
  downloadFromApi(
    `/invoices/${invoiceId}/pdf`,
    fallbackName,
    'Diese Rechnung wurde nicht gefunden.',
  );

export const downloadInvoiceXRechnung = (
  invoiceId: string,
  fallbackName: string,
): Promise<void> =>
  downloadFromApi(
    `/invoices/${invoiceId}/xrechnung`,
    fallbackName,
    'Diese Rechnung wurde nicht gefunden.',
  );

export const downloadExport = (
  entity: 'company' | 'contact' | 'deal',
  params: {
    search?: string | null;
    sortField?: string;
    sortDirection?: string;
    ids?: string[];
    filter?: Record<string, unknown>;
  },
): Promise<void> => {
  const query = new URLSearchParams();

  if (params.filter !== undefined && Object.keys(params.filter).length > 0) {
    query.set('liste', JSON.stringify(params.filter));
  }

  if (params.ids !== undefined && params.ids.length > 0) {
    query.set('ids', params.ids.join(','));
  }

  if (
    params.search !== null &&
    params.search !== undefined &&
    params.search !== ''
  ) {
    query.set('search', params.search);
  }

  if (params.sortField !== undefined) {
    query.set('sortField', params.sortField);
  }

  if (params.sortDirection !== undefined) {
    query.set('sortDirection', params.sortDirection);
  }

  const suffix = query.toString() === '' ? '' : `?${query.toString()}`;

  return downloadFromApi(`/export/${entity}${suffix}`, `${entity}.csv`);
};

export const downloadAppointmentIcs = (
  appointmentId: string,
  fallbackName: string,
): Promise<void> =>
  downloadFromApi(
    `/appointments/${appointmentId}/ics`,
    fallbackName,
    'Diesen Termin gibt es nicht.',
  );

export const downloadCalendarIcs = (
  from: string,
  to: string,
  ownerId?: string | null,
): Promise<void> => {
  const query = new URLSearchParams({ from, to });

  if (ownerId !== null && ownerId !== undefined && ownerId !== '') {
    query.set('ownerId', ownerId);
  }

  return downloadFromApi(
    `/appointments/ics?${query.toString()}`,
    `Stegwerk-${from}-bis-${to}.ics`,
  );
};

export const downloadAttachment = (
  attachmentId: string,
  fallbackName: string,
): Promise<void> =>
  downloadFromApi(
    `/attachments/${attachmentId}`,
    fallbackName,
    'Diesen Anhang gibt es nicht mehr.',
  );

const MAX_DATEI = 20 * 1024 * 1024;

export const uploadAttachment = async (
  ziel: {
    companyId?: string;
    contactId?: string;
    dealId?: string;
    quoteId?: string;
    invoiceId?: string;
    taskId?: string;
    noteId?: string;
  },
  datei: File,
): Promise<{ id: string; name: string; sizeBytes: number }> => {
  if (datei.size > MAX_DATEI) {
    throw new Error(
      `„${datei.name}“ ist ${(datei.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB groß; erlaubt sind bis 20 MB je Datei.`,
    );
  }

  const token = readToken();
  const query = new URLSearchParams({ name: datei.name });

  for (const [schluessel, wert] of Object.entries(ziel)) {
    if (wert !== undefined && wert !== '') {
      query.set(schluessel, wert);
    }
  }

  const response = await fetch(`${API_ROOT}/attachments?${query.toString()}`, {
    method: 'POST',
    headers: {
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      'content-type':
        datei.type === '' ? 'application/octet-stream' : datei.type,
    },
    body: datei,
  });

  if (!response.ok) {
    const said = await response
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);

    throw new Error(
      said ??
        (response.status === 413
          ? `„${datei.name}“ ist zu groß; erlaubt sind bis 20 MB je Datei.`
          : 'Die Datei konnte nicht hochgeladen werden.'),
    );
  }

  return (await response.json()) as {
    id: string;
    name: string;
    sizeBytes: number;
  };
};

export const uploadLetterheadLogo = async (datei: File): Promise<void> => {
  const token = readToken();

  const response = await fetch(`${API_ROOT}/letterhead/logo`, {
    method: 'POST',
    headers: {
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      'content-type':
        datei.type === '' ? 'application/octet-stream' : datei.type,
    },
    body: datei,
  });

  if (!response.ok) {
    const said = await response
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);

    throw new Error(said ?? 'Das Logo konnte nicht hochgeladen werden.');
  }
};

const PEM_ANFANG = '-----BEGIN CERTIFICATE-----';

export type DatabaseSsl = { ca: string; rejectUnauthorized: true } | undefined;

const alsPem = (roh: string): string => {
  const getrimmt = roh.trim();

  if (getrimmt.includes(PEM_ANFANG)) {
    return getrimmt;
  }

  const entpackt = Buffer.from(getrimmt, 'base64').toString('utf8');

  if (!entpackt.includes(PEM_ANFANG)) {
    throw new Error(
      'DATABASE_CA_CERT ist kein Zertifikat — erwartet wird PEM (beginnt mit ' +
        `"${PEM_ANFANG}") oder dasselbe base64-kodiert.`,
    );
  }

  return entpackt;
};

export const databaseSsl = (
  rohesZertifikat: string | undefined,
): DatabaseSsl => {
  if (rohesZertifikat === undefined || rohesZertifikat.trim() === '') {
    return undefined;
  }

  return {
    ca: alsPem(rohesZertifikat),
    rejectUnauthorized: true,
  };
};

export const databaseUrl = (
  url: string | undefined,
  rohesZertifikat: string | undefined,
): string | undefined => {
  if (url === undefined || url === '') {
    return url;
  }

  if (rohesZertifikat === undefined || rohesZertifikat.trim() === '') {
    return url;
  }

  try {
    const zerlegt = new URL(url);

    zerlegt.searchParams.delete('sslmode');
    zerlegt.searchParams.delete('ssl');
    zerlegt.searchParams.delete('sslrootcert');

    return zerlegt.toString();
  } catch {
    return url;
  }
};

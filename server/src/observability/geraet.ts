export const geraetAus = (ua: string | undefined): string | undefined => {
  if (ua === undefined || ua === '') {
    return undefined;
  }

  const browser = /Edg\//u.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/u.test(ua)
      ? 'Opera'
      : /Firefox\//u.test(ua)
        ? 'Firefox'
        : /Chrome\//u.test(ua)
          ? 'Chrome'
          : /Safari\//u.test(ua)
            ? 'Safari'
            : 'Browser';
  const system = /iPhone|iPad/u.test(ua)
    ? 'iOS'
    : /Android/u.test(ua)
      ? 'Android'
      : /Windows/u.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/u.test(ua)
          ? 'macOS'
          : /Linux/u.test(ua)
            ? 'Linux'
            : null;

  return system === null ? browser : `${browser} auf ${system}`;
};

export const kuerzeIp = (ip: string | undefined): string | undefined => {
  if (ip === undefined || ip === '') {
    return undefined;
  }

  const v4 = ip.replace(/^::ffff:/u, '');

  if (/^\d+\.\d+\.\d+\.\d+$/u.test(v4)) {
    return v4.replace(/\.\d+$/u, '.0');
  }

  const gruppen = ip.split(':').filter((g) => g !== '');

  return `${gruppen.slice(0, 3).join(':')}::`;
};

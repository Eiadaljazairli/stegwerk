import qrcode from 'qrcode-generator';

export const qrSvg = (inhalt: string, kantenlaenge = 200): string => {
  const qr = qrcode(0, 'M');

  qr.addData(inhalt);
  qr.make();

  const module = qr.getModuleCount();
  const rand = 4;
  const gesamt = module + rand * 2;

  const pfad: string[] = [];

  for (let zeile = 0; zeile < module; zeile += 1) {
    for (let spalte = 0; spalte < module; spalte += 1) {
      if (qr.isDark(zeile, spalte)) {
        pfad.push(`M${String(spalte + rand)} ${String(zeile + rand)}h1v1h-1z`);
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(kantenlaenge)}"`,
    ` height="${String(kantenlaenge)}" viewBox="0 0 ${String(gesamt)} ${String(gesamt)}"`,
    ` shape-rendering="crispEdges" role="img" aria-label="QR-Code für die Authentifizierungs-App">`,
    `<rect width="${String(gesamt)}" height="${String(gesamt)}" fill="#ffffff"/>`,
    `<path d="${pfad.join('')}" fill="#000000"/>`,
    `</svg>`,
  ].join('');
};

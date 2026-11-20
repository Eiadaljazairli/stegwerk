const BREITE = 560;

const FARBE = {
  grund: '#eef0f6',
  flaeche: '#ffffff',
  rand: '#dee2ec',
  text: '#10142a',
  gedaempft: '#545d78',
  schwach: '#838ca6',
  akzent: '#3b5bdb',
  akzentWeich: '#e9edff',
} as const;

const SCHRIFT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const sicher = (wert: string): string =>
  wert
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export type Huelle = {
  vorschau: string;
  ueberschrift: string;
  absaetze: string[];
  knopf?: { text: string; url: string };
  nachsatz?: string[];
};

const absatz = (inhalt: string, klein = false): string =>
  `<p style="margin:0 0 14px;font-size:${klein ? '13' : '15'}px;line-height:1.6;color:${
    klein ? FARBE.gedaempft : FARBE.text
  };">${inhalt}</p>`;

const knopf = (text: string, url: string): string => `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 18px;">
        <tr>
          <td align="center" bgcolor="${FARBE.akzent}" style="border-radius:8px;">
            <a href="${url}" style="display:inline-block;padding:13px 26px;font-family:${SCHRIFT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${sicher(text)}</a>
          </td>
        </tr>
      </table>`;

const klartext = (url: string): string => `
      <p style="margin:0 0 4px;font-size:12px;color:${FARBE.schwach};">Falls der Knopf nicht funktioniert:</p>
      <p style="margin:0 0 22px;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${url}" style="color:${FARBE.akzent};text-decoration:underline;">${url}</a></p>`;

export const huelle = ({
  vorschau,
  ueberschrift,
  absaetze,
  knopf: knopfDaten,
  nachsatz = [],
}: Huelle): string => `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${sicher(ueberschrift)}</title>
</head>
<body style="margin:0;padding:0;background-color:${FARBE.grund};">
  <!-- Die Vorschauzeile. Sichtbar nur in der Nachrichtenliste, nicht in der
       geoeffneten Nachricht; ohne sie zeigt das Postfach dort den Anfang des
       Fliesstextes, und das ist selten der Satz, der etwas erklaert. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${sicher(vorschau)}</div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${FARBE.grund};">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${BREITE}" style="width:100%;max-width:${BREITE}px;">

          <tr>
            <td style="padding:0 0 18px;font-family:${SCHRIFT};font-size:17px;font-weight:700;letter-spacing:1.5px;color:${FARBE.akzent};">STEGWERK</td>
          </tr>

          <tr>
            <td style="background-color:${FARBE.flaeche};border:1px solid ${FARBE.rand};border-radius:12px;padding:30px 28px 24px;font-family:${SCHRIFT};">
              <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:600;color:${FARBE.text};">${sicher(ueberschrift)}</h1>
              ${absaetze.map((text) => absatz(text)).join('\n              ')}
              ${knopfDaten === undefined ? '' : knopf(knopfDaten.text, knopfDaten.url)}
              ${knopfDaten === undefined ? '' : klartext(knopfDaten.url)}
              ${nachsatz.map((text) => absatz(text, true)).join('\n              ')}
            </td>
          </tr>

          <tr>
            <td style="padding:18px 4px 0;font-family:${SCHRIFT};font-size:12px;line-height:1.6;color:${FARBE.schwach};">
              Diese Nachricht wurde automatisch versendet.<br>
              Stegwerk — Ihr Vertrieb auf einen Blick.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

import {
  emailLesen,
  htmlDekodieren,
  htmlZuText,
  impressumLesen,
  impressumLink,
  registerLesen,
  telefonLesen,
  ustIdLesen,
  vertretungLesen,
} from './impressum';

const WORDPRESS = `<!DOCTYPE html>
<html lang="de-DE"><head>
<meta charset="UTF-8">
<title>Impressum &#8211; Nordwind Haustechnik GmbH</title>
<script>var x = "<div>Fake GmbH</div> 99999 Nirgendwo";</script>
<style>.a{content:"HRB 1"}</style>
</head>
<body>
<header><nav><ul>
  <li><a href="/">Start</a></li>
  <li><a href="/leistungen/">Leistungen</a></li>
  <li><a href="/impressum/">Impressum</a></li>
</ul></nav></header>
<main>
<h1>Impressum</h1>
<h2>Angaben gem&auml;&szlig; &sect; 5 DDG</h2>
<p>Nordwind Haustechnik GmbH<br>
Hafenstra&szlig;e 12a<br>
20457 Hamburg<br>
Deutschland</p>
<p><strong>Vertreten durch:</strong><br>
Jana Kr&uuml;ger, Tom Albers</p>
<h2>Kontakt</h2>
<p>Telefon: 040 / 123 456 - 0<br>
Telefax: 040 / 123 456 - 99<br>
E-Mail: <a href="mailto:info@nordwind-haustechnik.de">info@nordwind-haustechnik.de</a></p>
<h2>Registereintrag</h2>
<p>Eintragung im Handelsregister.<br>
Registergericht: Amtsgericht Hamburg<br>
Registernummer: HRB 123456</p>
<h2>Umsatzsteuer-ID</h2>
<p>Umsatzsteuer-Identifikationsnummer gem&auml;&szlig; &sect; 27 a Umsatzsteuergesetz:<br>
DE 123 456 789</p>
<h2>Streitschlichtung</h2>
<p>Die Europ&auml;ische Kommission stellt eine Plattform bereit: https://ec.europa.eu/consumers/odr/.</p>
</main>
<footer><a href="/datenschutz/">Datenschutz</a> <a href="/impressum/">Impressum</a></footer>
</body></html>`;

const BAUKASTEN = `<html><body>
<div class="footer"><a href="https://www.baeckerei-sonne.de/rechtliches/imprint">Imprint</a></div>
<div id="content">
<p>Impressum</p>
<p>Bäckerei Sonnenschein e.K. · Inhaberin: Maria Sonne · Lindenallee 3, 50667 Köln</p>
<p>Tel. +49 (0)221 9988776 | E-Mail: backstube [at] baeckerei-sonne [punkt] de</p>
<p>Amtsgericht Köln HRA 98765 · USt-IdNr. DE987654321</p>
</div>
</body></html>`;

describe('Impressum lesen', () => {
  it('liest ein typisches WordPress-Impressum ohne Navigation, Skript und Stil', () => {
    expect(impressumLesen(WORDPRESS)).toEqual({
      name: 'Nordwind Haustechnik GmbH',
      street: 'Hafenstraße 12a',
      postalCode: '20457',
      city: 'Hamburg',
      country: 'Deutschland',
      phone: '+49401234560',
      email: 'info@nordwind-haustechnik.de',
      registergericht: 'Amtsgericht Hamburg',
      registernummer: 'HRB 123456',
      ustIdNr: 'DE123456789',
      vertretung: 'Jana Krüger, Tom Albers',
    });
  });

  it('liest einen Baukasten, der alles in eine Zeile schreibt, und eine verschleierte Adresse', () => {
    const daten = impressumLesen(BAUKASTEN);

    expect(daten).toMatchObject({
      name: 'Bäckerei Sonnenschein e.K.',
      vertretung: 'Maria Sonne',
      street: 'Lindenallee 3',
      postalCode: '50667',
      city: 'Köln',
      phone: '+492219988776',
      email: 'backstube@baeckerei-sonne.de',
      registergericht: 'Amtsgericht Köln',
      registernummer: 'HRA 98765',
      ustIdNr: 'DE987654321',
    });
  });

  it('erfindet nichts, wo nichts steht', () => {
    expect(
      impressumLesen(
        '<html><body><p>Willkommen auf unserer Seite!</p></body></html>',
      ),
    ).toEqual({});
  });

  it('nimmt die Faxnummer nicht für das Telefon', () => {
    expect(telefonLesen('Fax: 089 1234567\nTel.: 089 7654321')).toBe(
      '+49897654321',
    );
    expect(telefonLesen('Telefon 089 7654321 · Fax 089 1234567')).toBe(
      '+49897654321',
    );
  });

  it('erkennt die USt-IdNr. auch mit Leerzeichen und nicht die Steuernummer', () => {
    expect(ustIdLesen('Steuernummer: 143/123/45678')).toBeUndefined();
    expect(ustIdLesen('USt-IdNr.: DE 811 907 980')).toBe('DE811907980');
    expect(ustIdLesen('UID: ATU 12345678')).toBe('ATU12345678');
  });

  it('liest Register und Gericht in beiden Reihenfolgen', () => {
    expect(
      registerLesen('Handelsregister: HRB 5678 B, Amtsgericht Charlottenburg'),
    ).toEqual({
      registernummer: 'HRB 5678 B',
      registergericht: 'Amtsgericht Charlottenburg',
    });
    expect(
      registerLesen('Eingetragen beim Amtsgericht München unter HRB 99887'),
    ).toEqual({
      registernummer: 'HRB 99887',
      registergericht: 'Amtsgericht München',
    });
  });

  it('schneidet bei der Vertretung ab, was auf derselben Zeile folgt', () => {
    expect(
      vertretungLesen(
        'Geschäftsführer: Dr. Eva Lang · Registergericht: AG Bonn',
      ),
    ).toBe('Dr. Eva Lang');
    expect(vertretungLesen('Vertreten durch den Vorstand:\nPaul Weber')).toBe(
      'Paul Weber',
    );
  });

  it('nimmt die Adresse aus mailto vor der im Text', () => {
    expect(
      emailLesen(
        'Kontakt: kontakt@x.de',
        '<a href="mailto:Info%40Firma.de">x</a>',
      ),
    ).toBe('info@firma.de');
    expect(emailLesen('Mail: info(at)firma(dot)de')).toBe('info@firma.de');
  });

  it('dekodiert eine alte Seite in ISO-8859-1 nach dem meta-Tag', () => {
    const bytes = Buffer.from(
      '<html><head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"></head><body>Müller & Söhne GmbH</body></html>',
      'latin1',
    );

    expect(htmlZuText(htmlDekodieren(bytes, 'text/html'))).toContain(
      'Müller & Söhne GmbH',
    );
  });

  it('bleibt bei feindlichem HTML schnell', () => {
    const start = Date.now();

    impressumLesen(`${'<script'.repeat(50_000)}${'<a href=x'.repeat(50_000)}`);
    impressumLesen(`${'<'.repeat(200_000)}`);
    impressumLesen(`Telefon ${'0'.repeat(100_000)}`);
    impressumLesen(`${'a'.repeat(100_000)}@`);

    expect(Date.now() - start).toBeLessThan(3_000);
  });

  it('bleibt bei einem Megabyte voller Blöcke linear', () => {
    const megabyte = 1024 * 1024;
    const start = Date.now();

    htmlZuText('<!---->'.repeat(Math.ceil(megabyte / 7)));
    htmlZuText('<script></script>'.repeat(Math.ceil(megabyte / 17)));
    htmlZuText(`${'<header>'.repeat(megabyte / 8)}<head>`);
    htmlZuText(`${'<svg></svg>x'.repeat(megabyte / 12)}<!--`);

    expect(Date.now() - start).toBeLessThan(3_000);
  });

  it('entfernt Blöcke weiter in der richtigen Reihenfolge', () => {
    expect(
      htmlZuText(
        '<header>Kopf</header><!-- <script> -->A<script>"<!--"</script>B<svg><style>x</style></svg>C<noscript>n</noscript>D',
      ),
    ).toBe('Kopf\nA B C D');
  });
});

describe('Link zum Impressum', () => {
  const basis = new URL('https://www.nordwind-haustechnik.de/');

  it('findet ihn über den Text und macht ihn absolut', () => {
    expect(impressumLink(WORDPRESS, basis)?.toString()).toBe(
      'https://www.nordwind-haustechnik.de/impressum/',
    );
  });

  it('findet „Imprint“ und nimmt die eigene Website vor einer fremden', () => {
    const html = `<a href="https://konzern.example/impressum">Impressum</a>
      <a href="/de/impressum#oben">Impressum</a>`;

    expect(impressumLink(html, basis)?.toString()).toBe(
      'https://www.nordwind-haustechnik.de/de/impressum',
    );
    expect(
      impressumLink(
        BAUKASTEN,
        new URL('https://www.baeckerei-sonne.de'),
      )?.toString(),
    ).toBe('https://www.baeckerei-sonne.de/rechtliches/imprint');
  });

  it('übergeht mailto, javascript und Seiten ohne Hinweis', () => {
    const html = `<a href="javascript:alert(1)">Impressum</a>
      <a href="mailto:a@b.de">Impressum</a><a href="/kontakt">Kontakt</a>`;

    expect(impressumLink(html, basis)).toBeNull();
  });

  it('bleibt bei vielen Links ohne Ende linear', () => {
    const links = '<a>'.repeat(1000) + '<a href="/impressum">'.repeat(1000);
    const html = links + '<'.repeat(1024 * 1024 - links.length);
    const start = performance.now();

    expect(impressumLink(html, basis)?.toString()).toBe(
      'https://www.nordwind-haustechnik.de/impressum',
    );
    expect(performance.now() - start).toBeLessThan(200);
  });

  it('liest den Linktext bis zur Grenze, dahinter nicht mehr', () => {
    const kurz = `<a href="/seite-1">${'x'.repeat(1990)} Impressum</a>`;
    const lang = `<a href="/seite-2">${'x'.repeat(2000)} Impressum</a>`;

    expect(impressumLink(kurz, basis)?.pathname).toBe('/seite-1');
    expect(impressumLink(lang, basis)).toBeNull();
  });
});

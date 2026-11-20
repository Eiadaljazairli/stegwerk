import {
  AttachmentAbgelehnt,
  contentDisposition,
  endungVon,
  MAX_BYTES,
  pruefeAnhang,
  sichererName,
} from './attachment-rules';

describe('der Name, unter dem gespeichert wird', () => {
  it('nimmt vom Pfad nur das Blatt', () => {
    expect(sichererName('C:\\Ordner\\Angebot.pdf')).toBe('Angebot.pdf');
    expect(sichererName('/etc/passwd')).toBe('passwd');
  });

  it('lässt sich nicht aus dem Verzeichnis führen', () => {
    expect(sichererName('../../../etc/passwd')).toBe('passwd');
    expect(sichererName('..\\..\\windows\\system32\\cmd.exe')).toBe('cmd.exe');
  });

  it('entfernt Zeilenumbrüche, mit denen sich Kopfzeilen fälschen ließen', () => {
    expect(sichererName('rechnung.pdf\r\nSet-Cookie: a=b')).toBe(
      'rechnung.pdfSet-Cookie: a=b',
    );
    expect(sichererName('a\nb.pdf')).toBe('ab.pdf');
    expect(sichererName('a\u0000b.pdf')).toBe('ab.pdf');
  });

  it('entfernt Anführungszeichen, die das Feld vorzeitig schlössen', () => {
    expect(sichererName('a"b.pdf')).toBe('ab.pdf');
  });

  it('behält Umlaute — sie sind kein Problem, sondern der Normalfall', () => {
    expect(sichererName('Angebot für Müller.pdf')).toBe(
      'Angebot für Müller.pdf',
    );
  });

  it('gibt einen Namen zurück, auch wenn nichts übrig bleibt', () => {
    expect(sichererName('')).toBe('datei');
    expect(sichererName('...')).toBe('datei');
    expect(sichererName('/')).toBe('datei');
  });

  it('kürzt sehr lange Namen', () => {
    expect(sichererName('a'.repeat(500))).toHaveLength(180);
  });
});

describe('die Endung', () => {
  it.each([
    ['Angebot.pdf', 'pdf'],
    ['Bild.PNG', 'png'],
    ['archiv.tar.gz', 'gz'],
  ])('liest %s als %s', (name, erwartet) => {
    expect(endungVon(name)).toBe(erwartet);
  });

  it.each(['ohnepunkt', '.versteckt', 'endetmitpunkt.'])(
    'gibt für %s nichts zurück',
    (name) => {
      expect(endungVon(name)).toBeNull();
    },
  );
});

describe('was angenommen wird', () => {
  it('nimmt eine gewöhnliche Datei', () => {
    expect(pruefeAnhang({ name: 'Vertrag.pdf', sizeBytes: 2000 })).toBe(
      'Vertrag.pdf',
    );
  });

  it('weist eine leere Datei ab', () => {
    expect(() => pruefeAnhang({ name: 'a.pdf', sizeBytes: 0 })).toThrow(
      AttachmentAbgelehnt,
    );
  });

  it('weist ab, was über der Grenze liegt', () => {
    expect(() =>
      pruefeAnhang({ name: 'a.pdf', sizeBytes: MAX_BYTES + 1 }),
    ).toThrow(/größer als 20 MB/u);
  });

  it('nimmt an, was genau auf der Grenze liegt', () => {
    expect(pruefeAnhang({ name: 'a.pdf', sizeBytes: MAX_BYTES })).toBe('a.pdf');
  });

  it.each(['seite.html', 'bild.svg', 'skript.js', 'setup.exe', 'shell.php'])(
    'weist %s ab',
    (name) => {
      expect(() => pruefeAnhang({ name, sizeBytes: 100 })).toThrow(
        AttachmentAbgelehnt,
      );
    },
  );

  it('gibt den bereinigten Namen zurück, nicht den eingereichten', () => {
    expect(
      pruefeAnhang({ name: '../../etc/Vertrag.pdf', sizeBytes: 100 }),
    ).toBe('Vertrag.pdf');
    expect(
      pruefeAnhang({ name: 'a\r\nSet-Cookie: x=1.pdf', sizeBytes: 100 }),
    ).toBe('aSet-Cookie: x=1.pdf');
  });

  it('prüft die Endung nach dem Bereinigen, nicht davor', () => {
    expect(() =>
      pruefeAnhang({ name: 'boese.html "', sizeBytes: 100 }),
    ).toThrow(AttachmentAbgelehnt);

    expect(() =>
      pruefeAnhang({ name: 'harmlos.pdf/../boese.html', sizeBytes: 100 }),
    ).toThrow(AttachmentAbgelehnt);
  });

  it('unterscheidet Groß- und Kleinschreibung der Endung nicht', () => {
    expect(() => pruefeAnhang({ name: 'Seite.HTML', sizeBytes: 100 })).toThrow(
      AttachmentAbgelehnt,
    );
  });
});

describe('die Kopfzeile für den Download', () => {
  it('nennt den Namen zweimal: einmal auf ASCII, einmal nach RFC 5987', () => {
    const kopf = contentDisposition('Angebot für Müller.pdf');

    expect(kopf).toContain('attachment;');
    expect(kopf).toContain('filename="Angebot f_r M_ller.pdf"');
    expect(kopf).toContain(
      "filename*=UTF-8''Angebot%20f%C3%BCr%20M%C3%BCller.pdf",
    );
  });

  it('enthält niemals einen Zeilenumbruch', () => {
    const kopf = contentDisposition('a\r\nSet-Cookie: gestohlen=1\r\n.pdf');

    expect(kopf).not.toMatch(/[\r\n]/u);
  });

  it('enthält niemals ein unmaskiertes Anführungszeichen im ASCII-Teil', () => {
    const kopf = contentDisposition('a"b.pdf');
    const zwischenAnfuehrung = /filename="([^"]*)"/u.exec(kopf);

    expect(zwischenAnfuehrung?.[1]).toBe('ab.pdf');
  });
});

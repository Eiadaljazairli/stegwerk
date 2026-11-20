import { describe, expect, it } from 'vitest';

import { alsDataUrl, bildTyp, istPdf, vorschauArt } from './vorschau';

const bytes = (...werte: number[]) => new Uint8Array(werte);
const text = (inhalt: string) => new TextEncoder().encode(inhalt);

describe('Vorschau von Anhängen', () => {
  it('entscheidet nach der Endung, ob es einen Knopf gibt', () => {
    expect(vorschauArt('Vertrag.PDF')).toBe('pdf');
    expect(vorschauArt('foto.jpeg')).toBe('bild');
    expect(vorschauArt('Angebot.docx')).toBe('office');
    expect(vorschauArt('zeichnung.svg')).toBeNull();
    expect(vorschauArt('ohne-endung')).toBeNull();
  });

  it('zeigt nur, was die ersten Bytes wirklich sind', () => {
    expect(istPdf(text('%PDF-1.7\n'))).toBe(true);
    expect(istPdf(text('<html>'))).toBe(false);
    expect(bildTyp(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(
      'image/png',
    );
    expect(bildTyp(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(bildTyp(text('GIF89a'))).toBe('image/gif');
    expect(bildTyp(text('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(bildTyp(text('<svg onload="alert(1)">'))).toBeNull();
    expect(bildTyp(text('<!doctype html>'))).toBeNull();
  });

  it('macht daraus eine data:-Adresse', () => {
    expect(alsDataUrl(text('GIF89a'), 'image/gif')).toBe(
      'data:image/gif;base64,R0lGODlh',
    );
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { uploadAttachment } from './download';

afterEach(() => {
  vi.unstubAllGlobals();
});

const datei = (groesse: number, name = 'Plan.pdf'): File => {
  const f = new File(['x'], name, { type: 'application/pdf' });

  Object.defineProperty(f, 'size', { value: groesse });

  return f;
};

describe('Anhang hochladen', () => {
  it('lehnt eine zu große Datei ab, bevor etwas gesendet wird', async () => {
    const abruf = vi.fn();

    vi.stubGlobal('fetch', abruf);

    await expect(
      uploadAttachment({ contactId: 'k1' }, datei(30 * 1024 * 1024)),
    ).rejects.toThrow('„Plan.pdf“ ist 30,0 MB groß; erlaubt sind bis 20 MB');
    expect(abruf).not.toHaveBeenCalled();
  });

  it('übersetzt die 413 des Webservers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('<html>413 Request Entity Too Large</html>', {
            status: 413,
          }),
        ),
      ),
    );

    await expect(
      uploadAttachment({ contactId: 'k1' }, datei(1024)),
    ).rejects.toThrow('„Plan.pdf“ ist zu groß');
  });
});

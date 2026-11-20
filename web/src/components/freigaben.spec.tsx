// @vitest-environment jsdom
import { act } from 'react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { clearSession, writeSession } from '../lib/session';

import { AktenVerknuepfungen } from './AktenVerknuepfungen';
import { Freigaben } from './Freigaben';
import { axeVerstoesse, type Gerendert, rendere } from './testumgebung';

const ID = '00000000-0000-4000-8000-0000000000a1';

const stand = (darfVerwalten: boolean) => ({
  freigabeStand: {
    darfVerwalten,
    verantwortlichId: null,
    freigaben: [
      {
        id: '00000000-0000-4000-8000-0000000000f1',
        userId: '00000000-0000-4000-8000-0000000000b1',
        name: 'Ben Test',
        stufe: 'lesen',
        erteiltVon: 'Anna Test',
        createdAt: '2026-10-28T10:00:00.000Z',
      },
    ],
  },
});

let offen: Gerendert | null = null;

afterEach(async () => {
  await offen?.abbauen();
  offen = null;
  clearSession();
});

describe('Freigaben', () => {
  it('nennt, für wen freigegeben ist, und bietet Verwaltenden die Auswahl', async () => {
    offen = await rendere(<Freigaben art="deal" datensatzId={ID} />, {
      daten: {
        ...stand(true),
        myPermissions: { everything: true, permissions: [], feldrechte: [] },
      },
    });

    const text = offen.container.textContent ?? '';

    expect(text).toContain('Freigegeben für Ben Test (Lesen).');
    expect(text).toContain('Entziehen');
    expect(text).toContain('Wer sieht das?');
    expect(
      offen.container.querySelector(
        'select[aria-label="Freigabe für Ben Test"]',
      ),
    ).not.toBeNull();
    expect(await axeVerstoesse(offen.container)).toEqual([]);
  });

  it('ohne Verwaltung nur die Zeile, ohne Auswahl', async () => {
    offen = await rendere(<Freigaben art="deal" datensatzId={ID} />, {
      daten: {
        ...stand(false),
        myPermissions: {
          everything: false,
          permissions: ['deal:view'],
          feldrechte: [],
        },
      },
    });

    const text = offen.container.textContent ?? '';

    expect(text).toContain('Freigegeben für Ben Test (Lesen).');
    expect(text).not.toContain('Entziehen');
    expect(text).not.toContain('Wer sieht das?');
    expect(offen.container.querySelector('select')).toBeNull();
  });
});

describe('Freigabe zurückgeben', () => {
  it('führt zur Liste statt den nicht mehr sichtbaren Datensatz neu zu laden', async () => {
    writeSession({
      token: 't',
      user: {
        id: '00000000-0000-4000-8000-0000000000b1',
        email: 'ben@test',
        firstName: 'Ben',
        lastName: 'Test',
      },
      workspace: { id: 'w', name: 'W', slug: 'w' },
    });

    offen = await rendere(
      <Routes>
        <Route
          path="/geschaefte/:id"
          element={<Freigaben art="deal" datensatzId={ID} />}
        />
        <Route path="/geschaefte" element={<p>Liste der Geschäfte</p>} />
      </Routes>,
      {
        pfad: `/geschaefte/${ID}`,
        daten: {
          ...stand(false),
          freigabeEntziehen: true,
          myPermissions: {
            everything: false,
            permissions: ['deal:view'],
            feldrechte: [],
          },
        },
      },
    );

    const knopf = [
      ...offen.container.querySelectorAll<HTMLButtonElement>('button'),
    ].find((b) => b.textContent === 'Zurückgeben');

    expect(knopf).toBeDefined();

    await act(async () => {
      knopf?.click();
      await new Promise((fertig) => setTimeout(fertig, 0));
    });

    const text = offen.container.textContent ?? '';

    expect(text).toContain('Liste der Geschäfte');
    expect(offen.container.querySelector('.error-banner')).toBeNull();
  });
});

describe('AktenVerknuepfungen', () => {
  it('zeigt weitere Akten, eine unsichtbare ohne Namen, und bietet freie Arten an', async () => {
    const gesetzt: [string, string | null][] = [];

    offen = await rendere(
      <AktenVerknuepfungen
        eintrag={{
          companyId: 'f1',
          dealId: 'g1',
          company: { id: 'f1', name: 'Muster GmbH' },
          deal: null,
        }}
        hier={{ dealId: 'x' }}
        mindestensEine
        onSetzen={(spalte, id) => {
          gesetzt.push([spalte, id]);

          return Promise.resolve();
        }}
      />,
    );

    const text = offen.container.textContent ?? '';

    expect(text).toContain('Muster GmbH');
    expect(text).toContain('Nicht sichtbar');
    expect(text).toContain('+ Kontakt');
    expect(await axeVerstoesse(offen.container)).toEqual([]);

    const loesen = offen.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Verknüpfung zu Muster GmbH lösen"]',
    );

    await act(async () => {
      loesen?.click();
    });

    expect(gesetzt).toEqual([['companyId', null]]);
  });
});

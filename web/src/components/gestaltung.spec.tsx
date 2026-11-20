// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { IconCompanies } from './Icons';
import { ObjectHeader } from './ObjectHeader';
import { StatusTabs } from './StatusTabs';
import { type Gerendert, rendere } from './testumgebung';
import { Werkzeugleiste } from './Werkzeugleiste';
import { Wordmark } from './Wordmark';

const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');

const regel = (selektor: string): string => {
  const start = css.indexOf(`\n${selektor} {\n`);

  if (start === -1) {
    throw new Error(`Regel fehlt: ${selektor}`);
  }

  return css.slice(start, css.indexOf('\n}', start));
};

let offen: Gerendert | null = null;

afterEach(async () => {
  await offen?.abbauen();
  offen = null;
});

describe('der Seitenkopf', () => {
  it('nennt das Objekt einmal, mit der Anzahl daneben', async () => {
    offen = await rendere(
      <ObjectHeader
        kind="company"
        icon={IconCompanies}
        label="Firmen"
        anzahl={17}
        hilfe="firmen-kontakte"
      />,
    );

    const h1 = offen.container.querySelector('h1');

    expect(h1?.textContent).toBe('Firmen 17');
    expect(h1?.querySelector('.object-header__anzahl')?.textContent).toBe('17');
    expect(offen.container.querySelector('.object-header__kind')).toBeNull();
    expect(offen.container.querySelector('.object-tile')).toBeNull();
    expect(
      offen.container.querySelector('.object-header__titelzeile .hilfe-link'),
    ).not.toBeNull();
  });

  it('zeigt den Namen klein darüber, wenn der Titel ein anderer ist', async () => {
    offen = await rendere(
      <ObjectHeader
        kind="data"
        icon={IconCompanies}
        label="Einstellungen"
        title="Alles an einem Ort"
      />,
    );

    expect(offen.container.querySelector('h1')?.textContent).toBe(
      'Alles an einem Ort',
    );
    expect(
      offen.container.querySelector('.object-header__kind')?.textContent,
    ).toBe('Einstellungen');
  });
});

describe('die Status-Reiter', () => {
  it('zeigen einen Betrag in jedem Reiter, sobald einer einen hat', async () => {
    offen = await rendere(
      <StatusTabs
        active=""
        onChange={() => undefined}
        tabs={[
          { key: '', label: 'Alle', count: 2 },
          { key: 'A', label: 'Angenommen', count: 2, sumCents: 210630 },
        ]}
      />,
    );

    const reiter = [...offen.container.querySelectorAll('[role="tab"]')];

    expect(reiter).toHaveLength(2);

    for (const r of reiter) {
      expect(r.querySelector('.status-tabs__sum')).not.toBeNull();
    }
  });

  it('zeigen keinen, wenn keiner einen hat', async () => {
    offen = await rendere(
      <StatusTabs
        active=""
        onChange={() => undefined}
        tabs={[
          { key: '', label: 'Alle', count: 2 },
          { key: 'B', label: 'Offen', count: 1 },
        ]}
      />,
    );

    expect(offen.container.querySelector('.status-tabs__sum')).toBeNull();
  });

  it('sind gleich breit', () => {
    expect(regel('.status-tabs')).toMatch(
      /grid-auto-columns: minmax\(\d+px, 1fr\);/u,
    );
  });
});

describe('die Werkzeugleiste', () => {
  it('klappt auf dem Telefon über „Filter“ auf und zu', async () => {
    offen = await rendere(
      <Werkzeugleiste>
        <div className="search">
          <input aria-label="Suche" />
        </div>
        <select aria-label="Phase" />
      </Werkzeugleiste>,
    );

    const leiste = offen.container.querySelector('.toolbar');
    const knopf = offen.container.querySelector<HTMLButtonElement>(
      '.toolbar__aufklappen',
    );

    expect(knopf?.getAttribute('aria-expanded')).toBe('false');
    expect(leiste?.classList.contains('is-offen')).toBe(false);

    await act(async () => {
      knopf?.click();
    });

    expect(knopf?.getAttribute('aria-expanded')).toBe('true');
    expect(leiste?.classList.contains('is-offen')).toBe(true);
  });

  it('verbirgt zugeklappt alles ausser Suche und Knopf', () => {
    expect(css).toMatch(
      /\.toolbar:not\(\.is-offen\) > :not\(\.search\):not\(\.toolbar__aufklappen\) \{\s*display: none;/u,
    );
  });
});

describe('die Marke', () => {
  it('ist der Name ohne Schnitt, gesperrt und halbfett', async () => {
    offen = await rendere(<Wordmark />);

    const marke = offen.container.querySelector('.wordmark');

    expect(marke?.textContent).toBe('Stegwerk');
    expect(marke?.children).toHaveLength(0);
    expect(css).not.toMatch(/wordmark__fuge/u);
    expect(regel('.wordmark')).toMatch(/letter-spacing: 0\.08em;/u);
    expect(regel('.wordmark')).toMatch(/font-weight: 600;/u);
    expect(regel('.wordmark')).toMatch(
      /color: var\(--wordmark-color, var\(--text\)\);/u,
    );
  });
});

describe('die Flächen und Steuerelemente', () => {
  it('haben eine Steuerhöhe von 32 px', () => {
    expect(regel('.button')).toMatch(/min-height: 32px;/u);
    expect(css).toMatch(
      /select:not\(\[multiple\]\):not\(\.badge\) \{\s*height: 32px;/u,
    );
  });

  it('nehmen für Auswahlfelder einen eigenen Pfeil, nicht den des Browsers', () => {
    expect(css).toMatch(
      /select:not\(\[multiple\]\):not\(\.badge\) \{\s*appearance: none;/u,
    );
  });

  it('färben den Primärknopf in Tinte, nicht in Blau', () => {
    expect(regel('.button')).toMatch(/background: var\(--primary\);/u);
  });

  it('zeigen Phasen als Tag: 20 px hoch, Radius 4', () => {
    expect(regel('.badge')).toMatch(/height: 20px;/u);
    expect(regel('.badge')).toMatch(/border-radius: var\(--radius-sm\);/u);
  });

  it('geben einer überfälligen Kennzahl keinen Verlauf und keinen Rahmen', () => {
    expect(css).not.toMatch(/\.metric\.is-alarming \{/u);
  });

  it('zeichnen keine Rahmen um die Felder einer Akte', () => {
    expect(regel('.detail-field')).not.toMatch(/outline/u);
  });

  it('stellen die Einstellungen in Spalten statt im Raster', () => {
    expect(regel('.einstellungen')).toMatch(/\n  columns: /u);
  });

  it('färben Kacheln und Avatare nicht', () => {
    expect(regel('.object-tile')).toMatch(/background: none;/u);
    expect(css).not.toMatch(/\.avatar--tone-\d \{/u);
  });
});

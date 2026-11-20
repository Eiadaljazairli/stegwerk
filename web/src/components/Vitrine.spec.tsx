// @vitest-environment jsdom
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { AuthContext } from '../lib/auth-kontext';
import { FunktionenPage, ProduktPage } from '../pages/ProduktPage';
import { type Gerendert, rendere } from './testumgebung';

let offen: Gerendert | null = null;

afterEach(async () => {
  await offen?.abbauen();
  offen = null;
});

const linkTexte = (container: Element): string[] =>
  [...container.querySelectorAll('header a, footer a')].map(
    (link) => link.textContent ?? '',
  );

const seite = (
  <Routes>
    <Route path="/funktionen" element={<FunktionenPage />} />
    <Route path="/funktionen/:slug" element={<ProduktPage />} />
  </Routes>
);

describe('Vitrine', () => {
  it.each([['/funktionen'], ['/funktionen/e-rechnung']])(
    '%s bietet Besuchern Anmelden und Konto anlegen',
    async (pfad) => {
      offen = await rendere(seite, { pfad });

      const texte = linkTexte(offen.container);

      expect(texte).toContain('Anmelden');
      expect(texte).toContain('Konto anlegen');
      expect(texte).not.toContain('Zur App');
    },
  );

  it.each([['/funktionen'], ['/funktionen/e-rechnung']])(
    '%s führt Angemeldete zurück in die App statt zum Anmelden',
    async (pfad) => {
      offen = await rendere(
        <AuthContext.Provider
          value={{
            session: null,
            isSignedIn: true,
            startSession: () => undefined,
            endSession: () => undefined,
          }}
        >
          {seite}
        </AuthContext.Provider>,
        { pfad },
      );

      const texte = linkTexte(offen.container);

      expect(texte).not.toContain('Anmelden');
      expect(texte).not.toContain('Konto anlegen');

      const zurApp = [
        ...offen.container.querySelectorAll<HTMLAnchorElement>('header a'),
      ].find((link) => link.textContent === 'Zur App');

      expect(zurApp?.getAttribute('href')).toBe('/');
    },
  );
});

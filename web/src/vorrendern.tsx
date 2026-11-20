import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';

import {
  OEFFENTLICHE_SEITEN,
  vorgerenderteDatei,
} from './lib/oeffentliche-seiten';
import { herkunftAus, vorgerenderteSeite } from './lib/seo';
import { EntwicklerPage } from './pages/EntwicklerPage';
import { FehlerbehebungPage } from './pages/FehlerbehebungPage';
import { LandingPage } from './pages/LandingPage';
import { FunktionenPage, ProduktPage } from './pages/ProduktPage';

export const SEITEN = OEFFENTLICHE_SEITEN.filter((seite) => seite.vorrendern);

export const rendere = (pfad: string): string =>
  renderToString(
    <StrictMode>
      <StaticRouter location={pfad}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/funktionen" element={<FunktionenPage />} />
          <Route path="/funktionen/:slug" element={<ProduktPage />} />
          <Route path="/entwickler" element={<EntwicklerPage />} />
          <Route path="/entwickler/:teil" element={<EntwicklerPage />} />
          <Route
            path="/hilfe/fehlerbehebung"
            element={<FehlerbehebungPage />}
          />
        </Routes>
      </StaticRouter>
    </StrictMode>,
  );

export { herkunftAus, vorgerenderteDatei, vorgerenderteSeite };

import { ApolloProvider } from '@apollo/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { ToastProvider } from './components/Toast';
import { App } from './App';
import { AppErrorFallback } from './components/AppErrorFallback';
import { apolloClient } from './lib/apollo';
import { AuthProvider } from './lib/auth';
import { ErrorBoundary, initialiseSentry } from './lib/sentry';
import { holeAltenSpeicher } from './lib/storage-migration';
import './styles.css';

initialiseSentry();

holeAltenSpeicher();

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary fallback={AppErrorFallback}>
      <ApolloProvider client={apolloClient}>
        <AuthProvider>
          <BrowserRouter>
            <ToastProvider>
              <App />
            </ToastProvider>
          </BrowserRouter>
        </AuthProvider>
      </ApolloProvider>
    </ErrorBoundary>
  </StrictMode>,
);

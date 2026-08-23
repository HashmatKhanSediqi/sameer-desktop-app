import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { App } from './App';
import { LocaleBootstrap } from './components/LocaleBootstrap';
import { AuthProvider } from './context/AuthContext';
import i18n from './i18n';
import './styles/fonts.css';
import './styles/global.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <LocaleBootstrap>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LocaleBootstrap>
    </I18nextProvider>
  </StrictMode>,
);

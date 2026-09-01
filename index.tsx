
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Tutorial from './TutorialPage';
import { I18nProvider } from './i18n';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const isTutorialPage = window.location.pathname.replace(/\/$/, '') === '/tutorial';
root.render(
  <React.StrictMode>
    <I18nProvider>
      {isTutorialPage ? <Tutorial /> : <App />}
    </I18nProvider>
  </React.StrictMode>
);

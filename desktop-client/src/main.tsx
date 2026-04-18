import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import './services/i18n';
import { applyTheme, initThemeWatcher } from './services/theme';
import App from './App';

// Apply the persisted theme as early as possible to avoid a flash.
initThemeWatcher().then(applyTheme);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import { installBrowserStub } from './services/browser-stub';

// Inject localStorage-backed stub when running in a plain browser
// (Vite dev / Preview MCP). In Electron the preload already put
// window.claw in place, so this is a no-op.
installBrowserStub();

import './services/i18n';
import { applyTheme, initThemeWatcher } from './services/theme';
import { installTestBridge } from './services/test-bridge';
import App from './App';

// DEV-only test bridge for Playwright visual-regression specs.
installTestBridge();

// Apply the persisted theme as early as possible to avoid a flash.
initThemeWatcher().then(applyTheme);

async function bootstrap() {
  // Opt-in MSW. `VITE_USE_MOCKS=1 pnpm dev` (or `pnpm dev:mock`) makes
  // the renderer intercept `/api/*` from committed fixtures. Failures
  // here are non-fatal — the app continues to hit the real backend.
  if (import.meta.env.VITE_USE_MOCKS === '1') {
    const { startMockWorker } = await import('./mocks/browser');
    await startMockWorker();
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();

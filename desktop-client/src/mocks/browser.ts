// MSW service-worker setup for the Electron renderer + plain browser dev.
// Only activated when `VITE_USE_MOCKS=1` or in `DEV` mode explicitly.
//
// Consumed by `src/main.tsx`. If the service-worker registration fails
// (possible in Electron with contextIsolation quirks), the error is
// caught and logged; the app falls through to the real backend URL.

import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

/** Best-effort start of the MSW service worker. Returns true if the
 *  worker started and will intercept requests; false if it failed (so
 *  callers can decide whether to fall back to the real remote). */
export async function startMockWorker(): Promise<boolean> {
  try {
    await worker.start({
      onUnhandledRequest: 'bypass', // let non-api/* traffic through (Vite HMR, etc.)
      serviceWorker: { url: '/mockServiceWorker.js' },
    });
    // eslint-disable-next-line no-console
    console.info('[mocks] MSW worker started');
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[mocks] MSW worker failed to start; falling back to real backend', err);
    return false;
  }
}

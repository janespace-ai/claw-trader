// MSW Node-mode server for Vitest. Used in `src/test-setup.ts`.
// Vitest runs in Node (jsdom env), so browser-mode service-worker is
// not available — use `msw/node` setupServer instead.

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);

import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Vitest config for desktop-client unit tests.
//
// - environment: 'jsdom' — zustand stores touch window/localStorage
//   idioms even when not strictly required; jsdom is cheap and
//   keeps tests portable between main/renderer-style code.
// - alias '@' — matches tsconfig so imports like `@/stores/x` resolve.
// - `setupFiles` wires up minimal fake `window.claw` so the settings
//   store's `load()` path doesn't blow up on IPC absence.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'eslint-plugin-claw/**/*.test.js'],
  },
});

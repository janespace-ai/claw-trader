import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import path from 'node:path';

// When CLAW_BROWSER_ONLY=1 (Preview MCP / plain browser dev), skip the
// electron plugin entirely so Vite runs a normal SPA.
const browserOnly = process.env.CLAW_BROWSER_ONLY === '1';

export default defineConfig({
  plugins: [
    react(),
    ...(browserOnly ? [] : [electron([
      {
        entry: 'electron/main.ts',
        onstart(opt) {
          opt.startup();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                entryFileNames: 'main.cjs',
                format: 'cjs',
              },
              external: ['electron', 'better-sqlite3'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(opt) {
          opt.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                entryFileNames: 'preload.cjs',
                format: 'cjs',
              },
              external: ['electron'],
            },
          },
        },
      },
    ])]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@electron': path.resolve(__dirname, 'electron'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    electron([
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
    ]),
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

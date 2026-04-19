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
      // Electron main process. package.json has `"type": "module"`, so
      // we emit the main bundle as ESM (`.mjs`) and let Electron 33+
      // load it natively. Trying to force `.cjs` here fails because
      // Vite/Rollup keep emitting top-level `import` statements — and
      // a `.cjs` file cannot contain them with type=module.
      //
      // `inlineDynamicImports: true` is kept to prevent Rollup from
      // splitting the entry into a tiny facade file that re-imports a
      // sibling chunk; Electron's main entry resolves cleanly only when
      // it is a single self-contained file.
      {
        entry: 'electron/main.ts',
        onstart(opt) {
          opt.startup();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            emptyOutDir: false,
            rollupOptions: {
              output: {
                entryFileNames: 'main.mjs',
                format: 'es',
                inlineDynamicImports: true,
              },
              external: ['electron', 'better-sqlite3'],
            },
          },
        },
      },
      // Electron preload. Preload scripts must be CommonJS when
      // contextIsolation=true + sandbox=false unless the calling window
      // opts into ESM preload. We keep this one as `.cjs` and pin the
      // format to the Vite `lib` mode so the emitted CJS is real
      // (no stray `import` statements).
      {
        entry: 'electron/preload.ts',
        onstart(opt) {
          opt.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            emptyOutDir: false,
            lib: {
              entry: 'electron/preload.ts',
              formats: ['cjs'],
              fileName: () => 'preload.cjs',
            },
            rollupOptions: {
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

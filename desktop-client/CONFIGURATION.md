# desktop-client configuration

The only piece of configuration the desktop-client currently needs is the
URL of the service-api (the read gateway for market data, strategies,
and backtests). Nothing else is hardcoded today.

## Resolution order

When the app starts, the backend URL is resolved using this priority
chain (highest wins):

1. **User override persisted in SQLite** — the value last saved from the
   Settings page. Stored at `<userData>/claw-data.sqlite` under the
   settings key `remote.baseURL`.

2. **Runtime config file** — `<userData>/claw-config.json` with a
   `"remoteBaseURL"` field. Useful when deploying to a different backend
   without rebuilding the app.

3. **Build-time env** — `VITE_REMOTE_BASE_URL` baked into the renderer
   bundle at `pnpm build` time (see [`.env.example`](./.env.example)).

4. **Hardcoded fallback** — `http://localhost:8081`. Single source of
   truth: `FALLBACK_REMOTE_BASE_URL` in both `electron/config.ts` and
   `src/stores/settingsStore.ts`.

The Electron main process resolves layers 2–4 at startup and exposes the
result to the renderer via `window.claw.config.get()`. The renderer's
settings store then picks SQLite (layer 1) over whatever the main
process resolved.

## Where `<userData>` lives

| OS      | Path                                                                |
| ------- | ------------------------------------------------------------------- |
| macOS   | `~/Library/Application Support/Claw Trader/`                        |
| Linux   | `~/.config/Claw Trader/`                                            |
| Windows | `%APPDATA%\Claw Trader\`  (typically `C:\Users\<you>\AppData\Roaming\Claw Trader\`) |

## How to override per environment

### End user — point a running install at a different backend

Quickest: **open Settings → Remote base URL** and type the new URL. This
writes to SQLite and wins over everything else.

Permanent / scripted: drop a file at `<userData>/claw-config.json`:

```json
{
  "remoteBaseURL": "http://10.0.0.5:8081"
}
```

The app reads it on next launch. Delete the file to revert to the
build-time default.

A template is committed at
[`claw-config.example.json`](./claw-config.example.json).

### Developer — change the built-in default for a local build

```bash
cp .env.example .env.local
# edit .env.local
pnpm build                   # or pnpm dev
```

### CI / release — change the default baked into distributed binaries

Set `VITE_REMOTE_BASE_URL` in the environment before running
`pnpm build`:

```bash
VITE_REMOTE_BASE_URL=https://claw.yourcompany.internal pnpm build
```

## How to tell which layer is active

The main process logs the resolved source at startup, e.g.:

```
[config] remoteBaseURL=http://10.0.0.5:8081 (source=config-file, path=/Users/alice/Library/Application Support/Claw Trader/claw-config.json)
```

`source` is one of `config-file`, `env`, or `fallback`. If the Settings
page has been used to override, the renderer will later overwrite that
value — the main-process log still shows what the app *booted* with.

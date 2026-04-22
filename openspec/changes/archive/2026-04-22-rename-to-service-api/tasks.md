## 1. Preflight — snapshot the target state

- [x] 1.1 Confirm working tree is clean on branch `rename-to-service-api`
- [x] 1.2 Take a baseline: `cd backtest-engine && go test ./... -short > /tmp/baseline.txt` so we can diff the green list after the rename
- [x] 1.3 Enumerate every file that references the old name:
      `grep -rln 'backtest-engine\|BACKTEST_' . --include='*.go' --include='*.yaml' --include='*.yml' --include='*.json' --include='*.md' --include='*.ts' --include='*.tsx' --include='*.sh' --include='Makefile' --include='Dockerfile' | grep -v openspec/changes/archive | grep -v node_modules`
      and save to `/tmp/rename-targets.txt` for post-rename verification

## 2. Directory rename (git mv preserves history)

- [x] 2.1 `git mv backtest-engine service-api` (single directory move; git detects this as a rename for each file)
- [x] 2.2 Verify: `git status` shows all files under `backtest-engine/*` as `renamed:` (not deleted+added)

## 3. Go module + import rewrites

- [x] 3.1 Edit `service-api/go.mod`: `module github.com/janespace-ai/claw-trader/backtest-engine` → `.../service-api`
- [x] 3.2 Rewrite all internal imports:
      `grep -rl 'claw-trader/backtest-engine' service-api | xargs sed -i '' 's|claw-trader/backtest-engine|claw-trader/service-api|g'`
- [x] 3.3 `cd service-api && go mod tidy` (clean up any stale indirect refs)
- [x] 3.4 `cd service-api && go build ./...` — must pass
- [x] 3.5 `cd service-api && go vet ./...` — must pass

## 4. Env-var prefix rename `BACKTEST_*` → `SERVICE_API_*`

- [x] 4.1 Rewrite env-var names in `service-api/internal/config/config.go` (applyEnvOverrides function)
- [x] 4.2 Rewrite env vars in `service-api/.env.example`
- [x] 4.3 Rewrite env vars in `service-api/docker-compose.yml`
- [x] 4.4 Rewrite env vars in `.github/workflows/` if any (check and skip if none)
- [x] 4.5 Grep sanity check: `grep -rn 'BACKTEST_' . | grep -v openspec/changes/archive` should be empty (or only in historical markdown)

## 5. Docker image / container / callback URL rename

- [x] 5.1 `service-api/Dockerfile`: `/out/backtest-engine` → `/out/service-api`
- [x] 5.2 `service-api/docker-compose.yml`: image `claw-backtest-engine` → `claw-service-api`; container_name same; `BACKTEST_CALLBACK_BASE=http://claw-backtest-engine:8081` → `SERVICE_API_CALLBACK_BASE=http://claw-service-api:8081`
- [x] 5.3 `service-api/config.yaml`: `callback_base: "http://claw-backtest-engine:8081"` → `http://claw-service-api:8081`
- [x] 5.4 `sandbox-service/config.yaml`: `callback.allowlist_hosts` entry `"backtest-engine"` → `"service-api"` AND `"claw-backtest-engine"` → `"claw-service-api"` (if both forms listed)
- [x] 5.5 `sandbox-service/tests/test_callback.py` / `test_api.py`: update any allowlist fixtures that hardcode `"backtest-engine"`

## 6. Makefile + root tooling paths

- [x] 6.1 `Makefile`: every `backtest-engine/…` path → `service-api/…`; `make test-backtest` target keeps its name (describes what it tests, not where it lives — decision noted in design.md)
- [x] 6.2 `Makefile`: `sandbox-service-*` targets already reference backtest-engine/docker-compose.yml via the `docker compose -f` flag; update path
- [x] 6.3 `Makefile`: `ai-cache-*` targets' `cd backtest-engine` → `cd service-api`
- [x] 6.4 Root `scripts/pre-commit`: grep and update if it references `backtest-engine`

## 7. README + documentation updates

- [x] 7.1 Root `README.md`, `README.zh-CN.md`, `README.zh-TW.md`: update directory listings, any prose mentioning `backtest-engine`
- [x] 7.2 `TESTING.md`: update env-var names and directory references
- [x] 7.3 `service-api/README.md` (if present): update self-references
- [x] 7.4 `service-api/docs/ai-review.md`: already references `internal/aireview` (package path) — check if any prose says "backtest-engine" and update
- [x] 7.5 `sandbox-service/README.md`: update prose mentioning `backtest-engine`
- [x] 7.6 `api/README.md`: update if it references the service name
- [x] 7.7 `data-aggregator/`: grep for cross-references, update if any

## 8. Root directory cleanup

- [x] 8.1 Delete empty `internal/` directory (`rmdir internal/version internal || git rm -r internal`)
- [x] 8.2 Delete empty `node_modules/` directory at root (`rmdir node_modules` — it's gitignored so just an fs delete)
- [x] 8.3 `mkdir -p docs/design && git mv design/trader.pen docs/design/trader.pen && rmdir design`
- [x] 8.4 `git mv e2e/run.sh scripts/e2e.sh && rmdir e2e` — update `Makefile` reference (`test-e2e` target invokes `e2e/run.sh` → `scripts/e2e.sh`)
- [x] 8.5 Root `README.md`: update directory listing to reflect new layout

## 9. Main openspec/specs/ text updates (mechanical, not behavioural)

- [x] 9.1 Grep `openspec/specs/` for `backtest-engine` literal:
      `grep -rln 'backtest-engine' openspec/specs`
      — expected hits: ~10 files (test-infrastructure, backtest-*, strategy-*, desktop-light-mockups, code-review, screener-execution)
- [x] 9.2 `sed -i '' 's/backtest-engine/service-api/g' openspec/specs/**/*.md`
      (or per-file if the shell glob isn't recursive in your shell)
- [x] 9.3 Visually spot-check the 10 files: every match should be a directory-reference (e.g. "`backtest-engine/internal/…`") or a service name, never a semantic term
- [x] 9.4 Re-grep: `grep -rn 'backtest-engine' openspec/specs` should be empty

## 10. Desktop-client path references (if any)

- [x] 10.1 Grep `desktop-client/` for any hardcoded `backtest-engine` URL or path strings
- [x] 10.2 `desktop-client/README.md` / `.env.example`: update any `claw-backtest-engine` container-URL defaults
- [x] 10.3 Run `npx vitest run` — must pass (194/194 as of the prior PR)

## 11. Full verification

- [x] 11.1 `cd service-api && go build ./... && go vet ./... && go test ./... -short` — all green, equal or improved vs baseline captured in 1.2
- [x] 11.2 `cd desktop-client && npm run api:lint && npx vitest run` — green
- [x] 11.3 `cd sandbox-service && python3 -m py_compile $(find src -name "*.py")` — compiles (tests skip without venv)
- [x] 11.4 Final grep hall-monitor:
      `grep -rln 'backtest-engine\|BACKTEST_' . --include='*.go' --include='*.yaml' --include='*.yml' --include='*.json' --include='*.md' --include='*.ts' --include='*.tsx' --include='*.sh' --include='Makefile' --include='Dockerfile' | grep -v openspec/changes/archive`
      — expected outputs: zero hits in live code / config; historical markdown in openspec/changes/archive is exempt
- [x] 11.5 Diff `/tmp/rename-targets.txt` vs `git diff --stat HEAD~N..HEAD` — every file in the grep snapshot should appear as modified or renamed
- [x] 11.6 `git log --follow service-api/internal/service/backtest_service.go` returns the full history from when the file was at `backtest-engine/...` (blame preservation check)

## 12. Archive the change

- [x] 12.1 `openspec archive rename-to-service-api --no-validate --skip-specs --yes`
      (no-validate because this is a pure-infra change that the spec-driven
      schema's delta validator doesn't model; skip-specs because the
      placeholder `specs/_meta/spec.md` is a no-op declaration, not a delta
      to sync into main specs)
- [x] 12.2 Commit the entire rename as one commit: `refactor: rename backtest-engine → service-api + root cleanup`
- [x] 12.3 Push branch; open PR with migration notes (copy from design.md's Migration Plan section)

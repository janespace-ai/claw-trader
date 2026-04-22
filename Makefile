# claw-trader — repo-wide test entry points.
#
# "CI is local only" — this Makefile is the single source of truth for
# how tests run. A future GitHub Actions workflow should wrap `make
# test-ci` with a single .yml and nothing more.
#
# Prereqs per target are documented next to each. `make help` prints
# a summary.

SHELL := /usr/bin/env bash

# DSN points at the shared Timescale started by `make db-up`.
# Override when testing against a non-default pg (e.g. remote staging).
CLAW_TEST_DSN ?= postgres://claw:claw@localhost:5432/claw?sslmode=disable

AGGREGATOR_COMPOSE := data-aggregator/docker-compose.yml
AGGREGATOR_COMPOSE_TEST := data-aggregator/docker-compose.test.yml

SANDBOX_DIR := sandbox-service
SANDBOX_VENV := $(SANDBOX_DIR)/.venv
SANDBOX_INSTALLED := $(SANDBOX_DIR)/.installed

.DEFAULT_GOAL := help
.PHONY: help test test-ci test-aggregator test-backtest test-sandbox test-desktop test-e2e \
	db-up db-down db-reap sync-aggregator-migrations \
	sandbox-service-build sandbox-service-up sandbox-service-down sandbox-service-logs

help: ## Print this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-32s\033[0m %s\n", $$1, $$2}'

## ---- High-level targets ----

test: test-aggregator test-backtest test-sandbox test-desktop ## Run the default test suites (no E2E)

test-ci: test ## Alias of `test` — single hook for future CI

## ---- Go services ----

test-aggregator: ## Go tests for data-aggregator (requires db-up)
	cd data-aggregator && CLAW_TEST_DSN='$(CLAW_TEST_DSN)' go test ./...

test-backtest: sync-aggregator-migrations ## Go tests for service-api (requires db-up)
	cd service-api && CLAW_TEST_DSN='$(CLAW_TEST_DSN)' go test ./...

## ---- Python sandbox (sandbox-service) ----

test-sandbox: $(SANDBOX_INSTALLED) ## pytest for sandbox-service
	$(SANDBOX_VENV)/bin/pytest $(SANDBOX_DIR)/tests/

$(SANDBOX_INSTALLED): $(SANDBOX_DIR)/pyproject.toml
	@echo "--- (re)creating sandbox-service venv ---"
	python3 -m venv $(SANDBOX_VENV)
	$(SANDBOX_VENV)/bin/pip install -q --upgrade pip
	$(SANDBOX_VENV)/bin/pip install -q -e "$(SANDBOX_DIR)[dev]"
	touch $@

sandbox-service-build: ## Build the sandbox-service docker image
	docker build -t claw-sandbox-service:latest $(SANDBOX_DIR)

sandbox-service-up: ## Start sandbox-service (via service-api compose — depends_on wires it in)
	docker compose -f service-api/docker-compose.yml up -d sandbox-service

sandbox-service-down: ## Stop sandbox-service
	docker compose -f service-api/docker-compose.yml stop sandbox-service

sandbox-service-logs: ## Tail sandbox-service logs
	docker compose -f service-api/docker-compose.yml logs -f sandbox-service

## ---- Ops CLI ----

ai-cache-stats: ## Show Gate 2 AI review cache counts + model drift
	cd service-api && go run ./cmd/claw-engine-cli -config config.yaml ai-cache stats

ai-cache-clear: ## Emergency: wipe Gate 2 cache (forces fresh review of everything)
	cd service-api && go run ./cmd/claw-engine-cli -config config.yaml ai-cache clear

ai-cache-purge-drift: ## Drop cache rows with stale model without restart
	cd service-api && go run ./cmd/claw-engine-cli -config config.yaml ai-cache purge-drift

## ---- Desktop client ----

test-desktop: ## Vitest for desktop-client
	cd desktop-client && npx vitest run

## ---- E2E ----

test-e2e: ## End-to-end smoke: rebuild stack, verify /api/klines, teardown
	scripts/e2e.sh

## ---- DB lifecycle ----

db-up: ## Start the shared Timescale container
	docker compose -f $(AGGREGATOR_COMPOSE) up -d timescaledb
	@echo "Waiting for Timescale to be ready..."
	@for i in $$(seq 1 30); do \
		docker exec claw-timescaledb pg_isready -U claw -d claw >/dev/null 2>&1 && exit 0; \
		sleep 1; \
	done; \
	echo "Timescale did not become ready in 30s" >&2; exit 1

db-down: ## Stop the shared Timescale container
	docker compose -f $(AGGREGATOR_COMPOSE) down

db-reap: ## Drop orphaned test_* schemas older than 1h
	@docker exec claw-timescaledb psql -U claw -d claw -c "\
		DO \$$\$$ \
		DECLARE s text; \
		BEGIN \
		  FOR s IN SELECT schema_name FROM information_schema.schemata \
		           WHERE schema_name LIKE 'test_%' LOOP \
		    EXECUTE 'DROP SCHEMA ' || quote_ident(s) || ' CASCADE'; \
		    RAISE NOTICE 'dropped %', s; \
		  END LOOP; \
		END \$$\$$;"

## ---- Utilities ----

sync-aggregator-migrations: ## Copy data-aggregator migrations into service-api testdata + refresh CHECKSUMS
	@mkdir -p service-api/internal/testdb/testdata/aggregator-migrations
	@cp data-aggregator/internal/store/migrations/*.sql \
		service-api/internal/testdb/testdata/aggregator-migrations/
	@cd service-api/internal/testdb/testdata/aggregator-migrations && \
		( for f in *.sql; do shasum -a 256 "$$f"; done ) > CHECKSUMS
	@echo "Migration snapshot synced; CHECKSUMS updated."

#!/usr/bin/env node
// Validates api/openapi.yaml structurally, and every api/examples/*.json
// against its operation's response schema. Exits non-zero on any issue.
//
// Deliberately tool-light: uses the `ajv` + `openapi-types` packages that
// are already on the devDep path via `openapi-typescript` + `msw`'s
// ecosystem. Avoids pulling a heavier linter like Redocly until we hit a
// real limitation.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(__dirname, '..', '..', 'api');
const SPEC_PATH = join(API_DIR, 'openapi.yaml');
const EXAMPLES_DIR = join(API_DIR, 'examples');

let errorCount = 0;
const err = (...args) => {
  errorCount += 1;
  // eslint-disable-next-line no-console
  console.error('✗', ...args);
};

// ---- Load spec --------------------------------------------------------------

let spec;
try {
  spec = yaml.load(readFileSync(SPEC_PATH, 'utf8'));
} catch (e) {
  err('openapi.yaml could not be parsed:', e.message);
  process.exit(1);
}

// Very small structural check: every operation has operationId + responses + summary
for (const [path, ops] of Object.entries(spec.paths ?? {})) {
  for (const [method, op] of Object.entries(ops)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
    if (!op.operationId) err(`${method.toUpperCase()} ${path}: missing operationId`);
    if (!op.summary) err(`${method.toUpperCase()} ${path}: missing summary`);
    if (!op.responses || Object.keys(op.responses).length === 0) {
      err(`${method.toUpperCase()} ${path}: no responses`);
    }
  }
}

// Custom rule: reject `type: string, format: date-time` on timestamp-named fields
const tsFieldNames = new Set([
  'ts',
  'from',
  'to',
  'entry_ts',
  'exit_ts',
  'started_at',
  'finished_at',
  'created_at',
  'updated_at',
  'detected_at',
  'repaired_at',
  'synced_at',
]);

function walk(node, path = '') {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((n, i) => walk(n, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (
      tsFieldNames.has(k) &&
      v &&
      typeof v === 'object' &&
      v.type === 'string' &&
      v.format === 'date-time'
    ) {
      err(
        `${path}.${k}: timestamp-named field declared as string(date-time); must be integer (unix seconds)`,
      );
    }
    walk(v, `${path}.${k}`);
  }
}
walk(spec, 'openapi');

// ---- Validate examples against their operation's 200 response schema --------

const ajv = new Ajv({ allErrors: true, strict: false, useDefaults: false });
addFormats(ajv);
// Register `#/components/schemas/*` so $ref resolves
if (spec.components?.schemas) {
  for (const [name, schema] of Object.entries(spec.components.schemas)) {
    ajv.addSchema(schema, `#/components/schemas/${name}`);
  }
}

// Build a map: operationId -> 200 response schema
const opSchemas = new Map();
for (const [, ops] of Object.entries(spec.paths ?? {})) {
  for (const [method, op] of Object.entries(ops)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
    const r200 = op.responses?.['200'];
    const schema = r200?.content?.['application/json']?.schema;
    if (op.operationId && schema) {
      opSchemas.set(op.operationId, schema);
    }
  }
}

const exampleFiles = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.json'));

for (const file of exampleFiles) {
  const opId = basename(file, '.json');
  if (!opSchemas.has(opId)) {
    err(`examples/${file}: no matching operationId "${opId}" in openapi.yaml`);
    continue;
  }
  const schema = opSchemas.get(opId);
  let data;
  try {
    data = JSON.parse(readFileSync(join(EXAMPLES_DIR, file), 'utf8'));
  } catch (e) {
    err(`examples/${file}: invalid JSON: ${e.message}`);
    continue;
  }
  const validate = ajv.compile(schema);
  if (!validate(data)) {
    err(`examples/${file}: schema mismatch`);
    for (const v of validate.errors ?? []) {
      err(`  .${v.instancePath || '(root)'}: ${v.message}`);
    }
  }
}

// Every operation should have at least one example
for (const opId of opSchemas.keys()) {
  if (!exampleFiles.includes(`${opId}.json`)) {
    err(`operation "${opId}": no fixture at api/examples/${opId}.json`);
  }
}

if (errorCount > 0) {
  // eslint-disable-next-line no-console
  console.error(`\n${errorCount} issue(s) found.`);
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log('✓ openapi.yaml valid; all', exampleFiles.length, 'examples match');

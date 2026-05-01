import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readFlag,
  writeFlag,
  readFlagSync,
  recordEvent,
  getRecentTelemetry,
} from './featureFlags';

describe('featureFlags — defaults + sync read', () => {
  beforeEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('readFlagSync returns the default for known keys', () => {
    expect(readFlagSync('unifiedWorkspace')).toBe(true);
    expect(readFlagSync('autoBacktestOnComplete')).toBe(true);
    expect(readFlagSync('nlParamSweepIntercept')).toBe(true);
  });

  it('readFlag (async) falls back to default when SQLite is unavailable', async () => {
    expect(await readFlag('unifiedWorkspace')).toBe(true);
  });
});

describe('featureFlags — backed by client SQLite', () => {
  let store: Record<string, unknown>;

  beforeEach(() => {
    store = {};
    (globalThis as unknown as { window: { claw: unknown } }).window = {
      claw: {
        db: {
          settings: {
            get: vi.fn(async (k: string) => store[k] ?? null),
            set: vi.fn(async (k: string, v: unknown) => {
              store[k] = v;
            }),
          },
        },
      },
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('writeFlag persists then readFlag returns the new value', async () => {
    await writeFlag('unifiedWorkspace', false);
    expect(await readFlag('unifiedWorkspace')).toBe(false);
  });

  it('readFlag falls back to default when value is missing', async () => {
    expect(await readFlag('autoBacktestOnComplete')).toBe(true);
  });
});

describe('featureFlags — telemetry ring', () => {
  it('recordEvent appends to the ring + getRecentTelemetry returns a copy', () => {
    recordEvent('test_event', { a: 1 });
    const ring = getRecentTelemetry();
    const last = ring[ring.length - 1];
    expect(last.event).toBe('test_event');
    expect(last.props).toEqual({ a: 1 });
    expect(typeof last.ts).toBe('number');
  });
});

import { describe, test, expect } from 'vitest';
import { toFriendlyError, toRawMessage } from './friendly';

// Tiny t() stand-in: echoes the key back so tests can assert which
// rule matched without depending on the real i18next bundle.
const t = ((k: string) => k) as unknown as Parameters<typeof toFriendlyError>[1];

describe('toRawMessage', () => {
  test('unwraps {code, message}', () => {
    expect(toRawMessage({ code: 'X', message: 'y' })).toBe('X: y');
  });
  test('unwraps Error', () => {
    expect(toRawMessage(new Error('boom'))).toBe('boom');
  });
  test('passes strings through', () => {
    expect(toRawMessage('raw')).toBe('raw');
  });
  test('handles null / undefined', () => {
    expect(toRawMessage(null)).toBe('');
    expect(toRawMessage(undefined)).toBe('');
  });
});

describe('toFriendlyError rules', () => {
  test('docker socket → docker rule', () => {
    const fe = toFriendlyError(
      'INTERNAL_ERROR: launch: create container: permission denied while trying to connect to the Docker daemon socket',
      t,
    );
    expect(fe.title).toBe('errors.friendly.docker.title');
    expect(fe.hint).toBe('errors.friendly.docker.hint');
    expect(fe.detail.toLowerCase()).toContain('docker');
  });

  test('network failure → network rule', () => {
    const fe = toFriendlyError(new Error('fetch failed: ECONNREFUSED'), t);
    expect(fe.title).toBe('errors.friendly.network.title');
  });

  test('invalid range → range rule', () => {
    const fe = toFriendlyError(
      { code: 'INVALID_RANGE', message: 'bind request: Mismatch type string with value number' },
      t,
    );
    expect(fe.title).toBe('errors.friendly.range.title');
  });

  test('python traceback → user_code rule', () => {
    const fe = toFriendlyError(
      'Traceback (most recent call last):\n  File "<user>", line 3\nNameError: foo',
      t,
    );
    expect(fe.title).toBe('errors.friendly.user_code.title');
  });

  test('unknown error → generic fallback', () => {
    const fe = toFriendlyError('some totally unknown failure', t);
    expect(fe.title).toBe('errors.friendly.generic.title');
    expect(fe.detail).toBe('some totally unknown failure');
  });

  test('AI_REJECTED (403) → ai_rejected rule, not auth', () => {
    // The raw message from service-api is
    // `AI_REJECTED: code rejected by AI reviewer` which also contains the
    // substring "403" via HTTP status.  Gate 2 rule must win over auth rule.
    const fe = toFriendlyError(
      { code: 'AI_REJECTED', message: 'code rejected by AI reviewer' },
      t,
    );
    expect(fe.title).toBe('errors.friendly.ai_rejected.title');
    expect(fe.hint).toBe('errors.friendly.ai_rejected.hint');
    expect(fe.detail).toContain('AI_REJECTED');
  });

  test('AI_REVIEW_UNAVAILABLE → ai_unavailable rule, not network', () => {
    const fe = toFriendlyError(
      { code: 'AI_REVIEW_UNAVAILABLE', message: 'ai reviewer temporarily unavailable; please retry' },
      t,
    );
    expect(fe.title).toBe('errors.friendly.ai_unavailable.title');
    expect(fe.hint).toBe('errors.friendly.ai_unavailable.hint');
  });
});

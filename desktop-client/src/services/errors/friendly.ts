// Friendly-error presenter.
//
// Backend errors tend to surface as opaque strings like
// `INTERNAL_ERROR: launch: create container: permission denied while
// trying to connect to the Docker daemon socket at unix:///var/run/...`
// which are hostile to end users. This module maps the raw message to
// a { title, hint, detail } shape that screens can render:
//
//   title  — short 1-line headline ("后端沙箱未就绪")
//   hint   — actionable guidance ("请启动 Docker Desktop 后重试")
//   detail — original raw string, shown in an expandable <details>
//            block for developers / bug reports.
//
// i18n: the caller passes the i18next `t()` function so translations
// stay in the standard `en.json` / `zh.json` files. Keys live under
// `errors.friendly.*`.

import type { TFunction } from 'i18next';

export interface FriendlyError {
  title: string;
  hint?: string;
  detail: string;
}

/** Normalize an unknown error value to a raw string. */
export function toRawMessage(err: unknown): string {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const b = err as { code?: unknown; message?: unknown };
    const msg = typeof b.message === 'string' ? b.message : '';
    const code = typeof b.code === 'string' ? b.code : '';
    if (code && msg) return `${code}: ${msg}`;
    if (msg) return msg;
    if (code) return code;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/** Pattern → i18n key map. Ordered most-specific first. Each entry
 *  picks up from the raw message body (case-insensitive match against
 *  the substring). When a rule matches, `title` + `hint` are looked up
 *  via t(); `detail` is always the raw message. */
interface Rule {
  test: RegExp;
  titleKey: string;
  hintKey?: string;
}

const RULES: Rule[] = [
  // Docker sandbox not available
  {
    test: /docker\.sock|docker daemon|create container|cannot connect to the docker daemon/i,
    titleKey: 'errors.friendly.docker.title',
    hintKey: 'errors.friendly.docker.hint',
  },
  // Backend reachability
  {
    test: /fetch failed|econnrefused|enotfound|network|failed to fetch|timeout/i,
    titleKey: 'errors.friendly.network.title',
    hintKey: 'errors.friendly.network.hint',
  },
  // Date-range mismatches (coming from parseRangeTime)
  {
    test: /invalid[_\s-]?range|bind request|mismatch type/i,
    titleKey: 'errors.friendly.range.title',
    hintKey: 'errors.friendly.range.hint',
  },
  // Auth / API keys
  {
    test: /unauthorized|forbidden|401|403|api[_\s-]?key/i,
    titleKey: 'errors.friendly.auth.title',
    hintKey: 'errors.friendly.auth.hint',
  },
  // Backend compiled the user code and it threw
  {
    test: /syntaxerror|nameerror|traceback|python/i,
    titleKey: 'errors.friendly.user_code.title',
    hintKey: 'errors.friendly.user_code.hint',
  },
  // Poll timeouts
  {
    test: /poll.*timed out|timeout|task.*timeout/i,
    titleKey: 'errors.friendly.timeout.title',
    hintKey: 'errors.friendly.timeout.hint',
  },
];

/** Map a raw error (any shape) + t() to a FriendlyError. Always
 *  returns — unknown errors fall back to a generic title with the raw
 *  message as both hint and detail. */
export function toFriendlyError(err: unknown, t: TFunction): FriendlyError {
  const detail = toRawMessage(err);
  for (const rule of RULES) {
    if (rule.test.test(detail)) {
      return {
        title: t(rule.titleKey),
        hint: rule.hintKey ? t(rule.hintKey) : undefined,
        detail,
      };
    }
  }
  return {
    title: t('errors.friendly.generic.title'),
    hint: undefined,
    detail,
  };
}

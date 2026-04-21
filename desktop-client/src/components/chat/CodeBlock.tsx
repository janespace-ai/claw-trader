import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Lightweight syntax highlighter — regex-based, no external lib. The
 *  language label + copy button render in a strip above the code so
 *  the user can tell what they're looking at at a glance and lift it
 *  into their editor with a single click.
 *
 *  Supported languages:
 *    - python (full keyword/builtin palette)
 *    - json   (keys, strings, numbers, literals)
 *    - anything else → plain monospace, no colorization. */

// ---- Python ----------------------------------------------------------------

const PY_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

const PY_BUILTINS = new Set([
  'self', 'bool', 'int', 'float', 'str', 'list', 'dict', 'set', 'tuple',
  'len', 'range', 'print', 'abs', 'min', 'max', 'sum', 'round', 'enumerate',
  'zip', 'sorted', 'isinstance', 'hasattr', 'getattr', 'type', 'super',
]);

type TokenKind = 'kw' | 'builtin' | 'num' | 'str' | 'cmt' | 'deco' | 'fn' | 'key' | 'lit' | 'txt';
type Token = { text: string; kind: TokenKind };

function tokenizePython(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    if (ch === '#') {
      const end = src.indexOf('\n', i);
      const slice = end === -1 ? src.slice(i) : src.slice(i, end);
      tokens.push({ text: slice, kind: 'cmt' });
      i += slice.length;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const triple = src.slice(i, i + 3);
      if (triple === '"""' || triple === "'''") {
        const end = src.indexOf(triple, i + 3);
        const slice = end === -1 ? src.slice(i) : src.slice(i, end + 3);
        tokens.push({ text: slice, kind: 'str' });
        i += slice.length;
        continue;
      }
      let j = i + 1;
      while (j < src.length && src[j] !== ch) {
        if (src[j] === '\\') j += 2;
        else j++;
      }
      tokens.push({ text: src.slice(i, j + 1), kind: 'str' });
      i = j + 1;
      continue;
    }

    if (ch === '@' && /[A-Za-z_]/.test(src[i + 1] ?? '')) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      tokens.push({ text: src.slice(i, j), kind: 'deco' });
      i = j;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9._xXabcdefABCDEFoO]/.test(src[j])) j++;
      tokens.push({ text: src.slice(i, j), kind: 'num' });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j);
      let kind: TokenKind = 'txt';
      if (PY_KEYWORDS.has(word)) kind = 'kw';
      else if (PY_BUILTINS.has(word)) kind = 'builtin';
      else if (src[j] === '(') kind = 'fn';
      tokens.push({ text: word, kind });
      i = j;
      continue;
    }

    tokens.push({ text: ch, kind: 'txt' });
    i++;
  }
  return tokens;
}

// ---- JSON ------------------------------------------------------------------

const JSON_LITERALS = new Set(['true', 'false', 'null']);

function tokenizeJson(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    // Strings — detect whether followed by `:` (→ object key) vs value.
    if (ch === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\') j += 2;
        else j++;
      }
      const text = src.slice(i, j + 1);
      // Skip whitespace to peek for `:`.
      let k = j + 1;
      while (k < src.length && /\s/.test(src[k])) k++;
      tokens.push({ text, kind: src[k] === ':' ? 'key' : 'str' });
      i = j + 1;
      continue;
    }

    if (/[-0-9]/.test(ch)) {
      let j = i;
      while (j < src.length && /[-0-9.eE+]/.test(src[j])) j++;
      tokens.push({ text: src.slice(i, j), kind: 'num' });
      i = j;
      continue;
    }

    if (/[a-z]/.test(ch)) {
      let j = i;
      while (j < src.length && /[a-z]/.test(src[j])) j++;
      const word = src.slice(i, j);
      tokens.push({ text: word, kind: JSON_LITERALS.has(word) ? 'lit' : 'txt' });
      i = j;
      continue;
    }

    tokens.push({ text: ch, kind: 'txt' });
    i++;
  }
  return tokens;
}

// ---- Shared render ---------------------------------------------------------

const COLOR: Record<TokenKind, string> = {
  kw:      'var(--accent-primary)',
  builtin: 'var(--accent-yellow)',
  num:     'var(--accent-green)',
  str:     'var(--accent-green)',
  cmt:     'var(--fg-muted)',
  deco:    'var(--accent-yellow)',
  fn:      'var(--accent-primary)',
  key:     'var(--accent-primary)',
  lit:     'var(--accent-yellow)',
  txt:     'var(--fg-primary)',
};

function tokenize(code: string, language: string): Token[] | null {
  const lang = language.toLowerCase();
  if (lang === 'python' || lang === 'py') return tokenizePython(code);
  if (lang === 'json') return tokenizeJson(code);
  return null;
}

interface Props {
  code: string;
  language?: string;
}

/** Renders syntax-highlighted code with a header strip showing the
 *  language and a one-click copy button. Unknown languages fall back to
 *  plain monospace (still copyable). */
export function CodeBlock({ code, language = 'text' }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const tokens = useMemo(() => tokenize(code, language), [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API can fail under sandboxed contexts — fall back to
      // a transient textarea select/copy so the button is never dead.
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  const label = language.toLowerCase();

  return (
    <div className="rounded-md overflow-hidden border border-border-subtle bg-surface-primary">
      {/* Header strip: language label + copy button. Sits flush with
          the code so users can see what kind of snippet this is and
          lift it out with one click. */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-secondary border-b border-border-subtle text-xs">
        <span className="text-fg-muted font-mono uppercase tracking-wide">
          {label}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={t('code.copy', { defaultValue: 'Copy' })}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-fg-secondary hover:text-fg-primary hover:bg-surface-tertiary transition-colors"
        >
          <CopyGlyph copied={copied} />
          <span>
            {copied
              ? t('code.copied', { defaultValue: 'Copied' })
              : t('code.copy', { defaultValue: 'Copy' })}
          </span>
        </button>
      </div>
      <pre
        className="p-3 text-xs font-mono leading-relaxed overflow-x-auto"
        style={{ maxHeight: 320 }}
      >
        <code>
          {tokens
            ? tokens.map((tok, i) => (
                <span
                  key={i}
                  style={{
                    color: COLOR[tok.kind],
                    fontStyle: tok.kind === 'cmt' ? 'italic' : undefined,
                  }}
                >
                  {tok.text}
                </span>
              ))
            : code}
        </code>
      </pre>
    </div>
  );
}

/** 14px glyph — switches to a check mark while the toast is active. */
function CopyGlyph({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="3 8.5 6.5 12 13 5" />
      </svg>
    );
  }
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="5" width="8.5" height="9" rx="1.5" />
      <path d="M3.5 10.5V3.5A1.5 1.5 0 0 1 5 2h6" />
    </svg>
  );
}

import { useMemo } from 'react';

/** Lightweight Python syntax highlighter — regex-based, no external lib.
 *  Highlights keywords, built-ins, strings, numbers, decorators, and comments. */

const KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

const BUILTINS = new Set([
  'self', 'bool', 'int', 'float', 'str', 'list', 'dict', 'set', 'tuple',
  'len', 'range', 'print', 'abs', 'min', 'max', 'sum', 'round', 'enumerate',
  'zip', 'sorted', 'isinstance', 'hasattr', 'getattr', 'type', 'super',
]);

type Token = { text: string; kind: 'kw' | 'builtin' | 'num' | 'str' | 'cmt' | 'deco' | 'fn' | 'txt' };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    // Comment
    if (ch === '#') {
      const end = src.indexOf('\n', i);
      const slice = end === -1 ? src.slice(i) : src.slice(i, end);
      tokens.push({ text: slice, kind: 'cmt' });
      i += slice.length;
      continue;
    }

    // Strings (single, double, triple)
    if (ch === '"' || ch === "'") {
      const triple = src.slice(i, i + 3);
      if (triple === '"""' || triple === "'''") {
        const end = src.indexOf(triple, i + 3);
        const slice = end === -1 ? src.slice(i) : src.slice(i, end + 3);
        tokens.push({ text: slice, kind: 'str' });
        i += slice.length;
        continue;
      }
      // Single-line string
      let j = i + 1;
      while (j < src.length && src[j] !== ch) {
        if (src[j] === '\\') j += 2; else j++;
      }
      tokens.push({ text: src.slice(i, j + 1), kind: 'str' });
      i = j + 1;
      continue;
    }

    // Decorator
    if (ch === '@' && /[A-Za-z_]/.test(src[i + 1] ?? '')) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      tokens.push({ text: src.slice(i, j), kind: 'deco' });
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9._xXabcdefABCDEFoO]/.test(src[j])) j++;
      tokens.push({ text: src.slice(i, j), kind: 'num' });
      i = j;
      continue;
    }

    // Identifier / keyword / builtin / function call
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j);
      let kind: Token['kind'] = 'txt';
      if (KEYWORDS.has(word)) kind = 'kw';
      else if (BUILTINS.has(word)) kind = 'builtin';
      else if (src[j] === '(') kind = 'fn';
      tokens.push({ text: word, kind });
      i = j;
      continue;
    }

    // Fallback — single char
    tokens.push({ text: ch, kind: 'txt' });
    i++;
  }
  return tokens;
}

const COLOR: Record<Token['kind'], string> = {
  kw:      'var(--accent-primary)',
  builtin: 'var(--accent-yellow)',
  num:     'var(--accent-green)',
  str:     'var(--accent-green)',
  cmt:     'var(--fg-muted)',
  deco:    'var(--accent-yellow)',
  fn:      'var(--accent-primary)',
  txt:     'var(--fg-primary)',
};

interface Props {
  code: string;
  language?: 'python' | string;
}

/** Renders syntax-highlighted code. Uses inline <span> per token; no outside deps. */
export function CodeBlock({ code }: Props) {
  const tokens = useMemo(() => tokenize(code), [code]);
  return (
    <pre
      className="bg-surface-primary rounded-md p-3 text-xs font-mono leading-relaxed overflow-x-auto"
      style={{ maxHeight: 320 }}
    >
      <code>
        {tokens.map((tok, i) => (
          <span
            key={i}
            style={{
              color: COLOR[tok.kind],
              fontStyle: tok.kind === 'cmt' ? 'italic' : undefined,
            }}
          >
            {tok.text}
          </span>
        ))}
      </code>
    </pre>
  );
}

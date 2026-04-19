// Reads CSS variables from the document root so `lightweight-charts`
// inherits the same tokens as the rest of the UI. Fallbacks are
// conservative defaults matching the dark theme.

import type { DeepPartial, ChartOptions } from 'lightweight-charts';

export function readThemeVars(): {
  surfacePrimary: string;
  surfaceSecondary: string;
  fgPrimary: string;
  fgMuted: string;
  borderSubtle: string;
  accentGreen: string;
  accentRed: string;
  accentPrimary: string;
  accentYellow: string;
} {
  const cs =
    typeof document !== 'undefined'
      ? getComputedStyle(document.documentElement)
      : null;
  const v = (name: string, fallback: string) =>
    (cs?.getPropertyValue(name).trim() || fallback).trim();

  return {
    surfacePrimary: v('--surface-primary', '#0A0A0A'),
    surfaceSecondary: v('--surface-secondary', '#1A1A1A'),
    fgPrimary: v('--fg-primary', '#FFFFFF'),
    fgMuted: v('--fg-muted', '#71717A'),
    borderSubtle: v('--border-subtle', '#27272A'),
    accentGreen: v('--accent-green', '#22C55E'),
    accentRed: v('--accent-red', '#EF4444'),
    accentPrimary: v('--accent-primary', '#A855F7'),
    accentYellow: v('--accent-yellow', '#F59E0B'),
  };
}

/** Resolve a CSS color string to a format lightweight-charts accepts.
 *
 * Supports:
 *   - `var(--accent-primary)` → reads the computed value of the token
 *   - `--accent-primary` → same (bare token name)
 *   - `#xxxxxx`, `rgb(...)`, named colors → passed through unchanged
 *   - `undefined` / `null` → returns `null` so callers can fall back
 *
 * Needed because `lightweight-charts` writes colors directly into
 * canvas stroke style, which does NOT evaluate CSS variables —
 * passing `var(--x)` there draws in the default (black) rather than
 * the themed color.
 */
export function resolveCssColor(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (typeof document === 'undefined') return trimmed;

  // `var(--name, fallback)` or `var(--name)`
  const varMatch = trimmed.match(/^var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^)]+))?\)$/);
  if (varMatch) {
    const resolved = getComputedStyle(document.documentElement)
      .getPropertyValue(varMatch[1])
      .trim();
    if (resolved) return resolved;
    if (varMatch[2]) return varMatch[2].trim();
    return null;
  }
  // Bare token name
  if (trimmed.startsWith('--')) {
    const resolved = getComputedStyle(document.documentElement)
      .getPropertyValue(trimmed)
      .trim();
    return resolved || null;
  }
  return trimmed;
}

/** Default chart options derived from the current theme. Passed to
 *  `createChart` and re-applied on theme flips via `chart.applyOptions`. */
export function chartOptionsFromTheme(width?: number, height?: number): DeepPartial<ChartOptions> {
  const t = readThemeVars();
  return {
    width,
    height,
    layout: {
      background: { color: t.surfacePrimary },
      textColor: t.fgMuted,
      fontFamily:
        'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    grid: {
      vertLines: { color: t.borderSubtle },
      horzLines: { color: t.borderSubtle },
    },
    rightPriceScale: { borderColor: t.borderSubtle },
    timeScale: { borderColor: t.borderSubtle, timeVisible: true, secondsVisible: false },
    crosshair: {
      vertLine: { color: t.fgMuted, width: 1, style: 2 },
      horzLine: { color: t.fgMuted, width: 1, style: 2 },
    },
  };
}

/** Observes `<html data-theme>` changes and fires `cb` so charts redraw. */
export function observeThemeChanges(cb: () => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'data-theme') {
        cb();
        return;
      }
    }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => obs.disconnect();
}

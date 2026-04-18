export type ThemePref = 'auto' | 'dark' | 'light';
export type CandleConvention = 'green-up' | 'red-up';

const THEME_KEY = 'ui.theme';
const CANDLE_KEY = 'chart.candleUp';

let currentPref: ThemePref = 'auto';

function resolve(pref: ThemePref): 'dark' | 'light' {
  if (pref === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return pref;
}

/** Apply the given (or stored) preference to document.documentElement. */
export function applyTheme(pref?: ThemePref): void {
  const next = pref ?? currentPref;
  currentPref = next;
  const resolved = resolve(next);
  document.documentElement.dataset.theme = resolved;
}

/** Load the saved preference + register a system-theme listener. */
export async function initThemeWatcher(): Promise<ThemePref> {
  const stored = (await window.claw.db.settings.get<ThemePref>(THEME_KEY)) ?? 'auto';
  currentPref = stored;

  const mm = window.matchMedia('(prefers-color-scheme: dark)');
  mm.addEventListener('change', () => {
    if (currentPref === 'auto') applyTheme('auto');
  });
  return stored;
}

/** Persist the user's theme choice and apply it. */
export async function setTheme(pref: ThemePref): Promise<void> {
  await window.claw.db.settings.set(THEME_KEY, pref);
  applyTheme(pref);
}

/** Get the saved candle-color convention. Defaults based on UI language. */
export async function getCandleConvention(fallbackLang = 'en'): Promise<CandleConvention> {
  const stored = await window.claw.db.settings.get<CandleConvention>(CANDLE_KEY);
  if (stored === 'green-up' || stored === 'red-up') return stored;
  // First-run: Chinese UI defaults to red-up, others default to green-up.
  return fallbackLang.startsWith('zh') ? 'red-up' : 'green-up';
}

export async function setCandleConvention(c: CandleConvention): Promise<void> {
  await window.claw.db.settings.set(CANDLE_KEY, c);
}

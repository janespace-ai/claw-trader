/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['attribute', 'data-theme="dark"'],
  theme: {
    extend: {
      // --- Colors (CSS variables from index.css, resolve per theme) ------
      colors: {
        surface: {
          primary: 'var(--surface-primary)',
          secondary: 'var(--surface-secondary)',
          tertiary: 'var(--surface-tertiary)',
          inverse: 'var(--surface-inverse)',
        },
        fg: {
          primary: 'var(--fg-primary)',
          secondary: 'var(--fg-secondary)',
          muted: 'var(--fg-muted)',
          inverse: 'var(--fg-inverse)',
        },
        accent: {
          primary: 'var(--accent-primary)',
          'primary-dim': 'var(--accent-primary-dim)',
          green: 'var(--accent-green)',
          'green-dim': 'var(--accent-green-dim)',
          red: 'var(--accent-red)',
          'red-dim': 'var(--accent-red-dim)',
          yellow: 'var(--accent-yellow)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
      },

      // --- Spacing scale matched to Pencil `design/trader.pen` tokens ---
      // Pencil uses: 0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64 (px).
      // Tailwind multiplies by 4px by default; we hand-name the scale so
      // it matches Pencil exactly. `claw/tailwind-spacing-scale` ESLint
      // rule nudges devs to stay on-scale.
      spacing: {
        0: '0',
        px: '1px',
        0.5: '2px',
        1: '4px',
        1.5: '6px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        10: '40px',
        12: '48px',
        16: '64px',
      },

      // --- Border radius scale ---------------------------------------
      borderRadius: {
        none: '0',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        full: '9999px',
      },

      // --- Font families ---------------------------------------------
      fontFamily: {
        heading: ['Geist', 'PingFang SC', 'system-ui', 'sans-serif'],
        body: ['Inter', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', '"JetBrains Mono"', 'monospace'],
        data: ['"Geist Mono"', '"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};

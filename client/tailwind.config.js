/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Brand accent ramp — `brand.600` is the primary action colour.
        // Driven by CSS variables (RGB triplets) so the runtime theme switcher
        // can re-skin the whole app without touching a single component. The
        // default values live in styles/index.css :root and equal the original
        // purple ramp exactly, so the out-of-the-box appearance is unchanged.
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },
        ink: {
          // Primary body text — very dark navy, near-black for strong readability.
          DEFAULT: 'var(--color-ink, #1C1731)',
          // Secondary text/labels. Darkened from #615C77 so headings, values and
          // labels never read as pale grey (global readability pass).
          muted: 'var(--color-ink-muted, #3A3552)',
          // Tertiary text/hints. Darkened from #8B87A0 but kept a step lighter
          // than `muted` so the type hierarchy still reads.
          subtle: 'var(--color-ink-subtle, #4E4A66)',
        },
        line: 'var(--color-line, #E6E2F2)',
        canvas: 'var(--color-canvas, #F7F5FC)',
        card: 'var(--color-card, #FFFFFF)',
        danger: {
          DEFAULT: 'var(--color-danger, #B32424)',
          soft: 'var(--color-danger-soft, #FDF2F2)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(28, 23, 49, 0.04), 0 12px 32px -12px rgba(28, 23, 49, 0.12)',
        focus: '0 0 0 3px rgb(var(--brand-600) / 0.18)',
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.25rem' },
    },
  },
  plugins: [],
};

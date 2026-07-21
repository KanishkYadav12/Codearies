/**
 * Tailwind configuration.
 *
 * Frontend constraint #1: Tailwind only — no DaisyUI, ShadCN, MUI or any other
 * component library. Everything visual in this app is composed from these
 * tokens, so the design system lives here rather than in a vendor theme.
 *
 * Dark mode uses the `class` strategy: the theme is a user *preference* stored
 * on their account, so it must be controllable independently of the OS setting.
 */

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',

  content: ['./index.html', './src/**/*.{js,jsx}'],

  theme: {
    extend: {
      colors: {
        // Surfaces, darkest to lightest. Named by role rather than by shade so
        // the palette can shift without renaming every usage.
        ink: {
          950: '#080b14',
          900: '#0d1220',
          800: '#141b2d',
          700: '#1d2739',
          600: '#2a3549',
          500: '#3b4860'
        },
        // Brand accent — the "drop".
        drop: {
          50: '#eff9ff',
          100: '#def1ff',
          200: '#b6e5ff',
          300: '#75d3ff',
          400: '#2cbeff',
          500: '#00a3f5',
          600: '#0081d2',
          700: '#0067aa',
          800: '#05578c',
          900: '#0b4874'
        },
        // Per-type badge colours, referenced by DropTypeBadge.
        type: {
          code: '#a78bfa',
          command: '#34d399',
          link: '#38bdf8',
          note: '#fbbf24'
        }
      },

      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace'
        ]
      },

      // Frontend constraint #4: no animation library. Every animation in the
      // app is a hand-written keyframe, declared here and in index.css.
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(24px)' },
          to: { opacity: '1', transform: 'translateX(0)' }
        },
        'slide-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' }
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' }
        },
        bounce_soft: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' }
        },
        // Used by the loading skeletons.
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        },
        // The reveal in recall mode.
        'reveal-content': {
          from: { opacity: '0', transform: 'translateY(-8px)', filter: 'blur(4px)' },
          to: { opacity: '1', transform: 'translateY(0)', filter: 'blur(0)' }
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.35)', opacity: '0' },
          '100%': { transform: 'scale(1.35)', opacity: '0' }
        }
      },

      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'fade-in-up': 'fade-in-up 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in-right': 'slide-in-right 240ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-up': 'slide-up 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scale-in 180ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'bounce-soft': 'bounce_soft 1.4s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
        'reveal-content': 'reveal-content 320ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.24, 0, 0.38, 1) infinite'
      },

      boxShadow: {
        card: '0 1px 2px rgba(8, 11, 20, 0.06), 0 8px 24px -12px rgba(8, 11, 20, 0.18)',
        lifted: '0 8px 30px -8px rgba(8, 11, 20, 0.28)',
        glow: '0 0 0 1px rgba(0, 163, 245, 0.35), 0 8px 32px -12px rgba(0, 163, 245, 0.5)'
      }
    }
  },

  plugins: []
};

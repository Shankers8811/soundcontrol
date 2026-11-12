import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        'bg-elevated': 'var(--color-bg-elevated)',
        surface: 'var(--color-surface)',
        border: 'var(--color-border)',
        'border-input': 'var(--color-border-input)',
        text: 'var(--color-text)',
        'text-muted': 'var(--color-text-muted)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'on-accent': 'var(--color-on-accent)',
        danger: 'var(--color-danger)',
        'danger-hover': 'var(--color-danger-hover)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        overlay: 'var(--color-overlay)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        display: ['var(--text-display)', { lineHeight: '1.1', fontWeight: '700' }],
        h1: ['var(--text-h1)', { lineHeight: '1.2', fontWeight: '600' }],
        h2: ['var(--text-h2)', { lineHeight: '1.3', fontWeight: '600' }],
        h3: ['var(--text-h3)', { lineHeight: '1.3', fontWeight: '600' }],
        'body-lg': ['var(--text-body-lg)', { lineHeight: '1.6' }],
        body: ['var(--text-body)', { lineHeight: '1.5' }],
        'body-sm': ['var(--text-body-sm)', { lineHeight: '1.5' }],
        caption: ['var(--text-caption)', { lineHeight: '1.4' }],
      },
      spacing: {
        0: 'var(--space-0)',
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
        10: 'var(--space-10)',
        12: 'var(--space-12)',
      },
      borderRadius: {
        none: 'var(--radius-none)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        none: 'var(--shadow-none)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      transitionDuration: {
        fast: '100ms',
        base: '150ms',
        slow: '200ms',
        page: '300ms',
      },
      transitionTimingFunction: {
        'ease-out': 'ease-out',
        'ease-in-out': 'ease-in-out',
      },
      maxWidth: {
        layout: 'var(--layout-max-width)',
      },
      width: {
        sidebar: 'var(--layout-sidebar-width)',
      },
      height: {
        header: 'var(--layout-header-height)',
      },
    },
  },
  plugins: [],
} satisfies Config;
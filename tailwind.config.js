/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"IBM Plex Sans"',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
          '"Noto Color Emoji"',
        ],
      },
      colors: {
        akiva: {
          bg: 'var(--akiva-bg)',
          surface: 'var(--akiva-surface)',
          'surface-muted': 'var(--akiva-surface-muted)',
          'surface-raised': 'var(--akiva-surface-raised)',
          border: 'var(--akiva-border)',
          'border-strong': 'var(--akiva-border-strong)',
          text: 'var(--akiva-text)',
          'text-muted': 'var(--akiva-text-muted)',
          accent: 'var(--akiva-accent)',
          'accent-strong': 'var(--akiva-accent-strong)',
          'accent-text': 'var(--akiva-accent-text)',
          'accent-soft': 'var(--akiva-accent-soft)',
          success: 'var(--akiva-success)',
          'success-soft': 'var(--akiva-success-soft)',
          warning: 'var(--akiva-warning)',
          'warning-soft': 'var(--akiva-warning-soft)',
          danger: 'var(--akiva-danger)',
          'danger-soft': 'var(--akiva-danger-soft)',
          pending: 'var(--akiva-pending)',
          'pending-soft': 'var(--akiva-pending-soft)',
          info: 'var(--akiva-info)',
          'info-soft': 'var(--akiva-info-soft)',
          'table-header': 'var(--akiva-table-header)',
          'table-header-text': 'var(--akiva-table-header-text)',
          'table-row-hover': 'var(--akiva-table-row-hover)',
          'table-stripe': 'var(--akiva-table-stripe)',
        },
        // Brand colors - update these values to change the brand color
        brand: {
          50: 'rgba(236, 72, 153, 0.1)',
          100: '#fce7f3', // Pink 100 - light mode background
          200: '#fbcfe8', // Pink 200 - light mode background
          300: '#f9a8d4', // Pink 300
          400: '#f472b6', // Pink 400
          500: '#ec4899', // Pink 500 - main brand color
          600: '#db2777', // Pink 600
          700: '#be185d', // Pink 700
          800: '#9d174d', // Pink 800 - dark mode background
          900: '#831843', // Pink 900 - dark mode background
          // Dark mode specific - lighter variants for better readability
          'dark-100': 'rgba(236, 72, 153, 0.15)',
          'dark-200': 'rgba(236, 72, 153, 0.25)',
          'dark-300': 'rgba(236, 72, 153, 0.35)',
          'dark-text': '#f9a8d4', // Pink 400 - readable text on dark
          'dark-text-muted': '#f472b6', // Pink 400 - muted readable text
        },
        
        // Custom amber color
        'amber-150': '#fef3c7',
        
        // Dark mode specific colors with warm Akiva brand neutrals
        dark: {
          bg: {
            primary: '#0d1117',
            secondary: '#111827',
            tertiary: '#1f2937',
          },
          text: {
            primary: '#f8fafc',
            secondary: '#e2e8f0',
            muted: '#cbd5e1',
          },
          border: {
            DEFAULT: '#334155',
            light: '#475569',
          },
        },
        
        // High contrast dark variants
        'dark-bg': '#0d1117',
        'dark-card': '#111827',
        'dark-border': '#334155',
        'dark-text': '#f8fafc',
        'dark-text-secondary': '#e2e8f0',
        'dark-text-muted': '#cbd5e1',
      },
      
      // Custom box shadows for dark mode
      boxShadow: {
        'dark': '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.3)',
        'dark-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.3)',
        'dark-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
        'glow-blue': '0 0 20px rgba(96, 165, 250, 0.4)',
        'glow-green': '0 0 20px rgba(74, 222, 128, 0.4)',
        'glow-brand': '0 0 20px rgba(236, 72, 153, 0.4)',
      },
      
      // Animation utilities for smooth transitions
      transitionDuration: {
        '400': '400ms',
      },
    },
  },
  plugins: [],
};

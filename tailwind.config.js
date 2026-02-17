/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
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
        
        // Dark mode specific colors with high contrast
        dark: {
          bg: {
            primary: '#0f172a',     // Slate 900 - main background
            secondary: '#1e293b',   // Slate 800 - cards/sidebar
            tertiary: '#334155',    // Slate 700 - hover states
          },
          text: {
            primary: '#f8fafc',     // Slate 50 - primary text
            secondary: '#e2e8f0',   // Slate 200 - secondary text
            muted: '#94a3b8',       // Slate 400 - muted text
          },
          border: {
            DEFAULT: '#334155',     // Slate 700
            light: '#475569',       // Slate 600
          },
        },
        
        // High contrast dark variants
        'dark-bg': '#0f172a',
        'dark-card': '#1e293b',
        'dark-border': '#334155',
        'dark-text': '#f1f5f9',
        'dark-text-secondary': '#cbd5e1',
        'dark-text-muted': '#94a3b8',
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

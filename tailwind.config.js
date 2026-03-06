/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Codex Design System Colors (VS Code-inspired)
      colors: {
        'codex-bg': '#1e1e1e',           // Primary background (editor)
        'codex-sidebar': '#252526',      // Sidebar background
        'codex-surface': '#2d2d30',      // Cards, panels, hover states
        'codex-surface-hover': '#37373d', // Hover state for surfaces
        'codex-border': '#3e3e42',       // Borders (very subtle)
        'codex-accent': '#8B5CF6',       // ProdForge purple accent
        'codex-accent-hover': '#7C3AED', // Accent hover
        'codex-text-primary': '#cccccc', // Primary text
        'codex-text-secondary': '#858585', // Secondary text
        'codex-text-muted': '#6a6a6a',   // Muted text
        'codex-text-dimmed': '#505050',  // Very muted text
      },

      // Typography scale (smaller, more compact like VS Code)
      fontSize: {
        'xxs': ['0.625rem', { lineHeight: '0.875rem' }],  // 10px
        'xs': ['0.6875rem', { lineHeight: '1rem' }],      // 11px
        'sm': ['0.75rem', { lineHeight: '1.125rem' }],    // 12px (new base)
        'base': ['0.8125rem', { lineHeight: '1.25rem' }], // 13px
        'md': ['0.875rem', { lineHeight: '1.375rem' }],   // 14px
        'lg': ['1rem', { lineHeight: '1.5rem' }],         // 16px
        'xl': ['1.125rem', { lineHeight: '1.75rem' }],    // 18px
        '2xl': ['1.5rem', { lineHeight: '2rem' }],        // 24px
      },

      // Font families
      fontFamily: {
        'sans': ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
        'mono': ['SF Mono', 'Monaco', 'Menlo', 'Consolas', 'monospace'],
      },

      // Animations (200-250ms smooth transitions)
      animation: {
        'in': 'fadeIn 0.3s ease-in-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'slide-down': 'slideDown 0.25s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },

      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },

      // Transition durations
      transitionDuration: {
        '200': '200ms',
        '250': '250ms',
      },
    },
  },
  plugins: [],
}

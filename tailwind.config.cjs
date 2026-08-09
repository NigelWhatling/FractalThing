/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Token values live in src/index.css so light/dark is one variable swap.
        void: 'var(--ft-void)',
        panel: 'var(--ft-panel)',
        'panel-solid': 'var(--ft-panel-solid)',
        raised: 'var(--ft-raised)',
        rule: 'var(--ft-rule)',
        'rule-strong': 'var(--ft-rule-strong)',
        dim: 'var(--ft-dim)',
        warn: 'var(--ft-warn)',
        danger: 'var(--ft-danger)',
        ink: 'var(--ft-text)',
        accent: 'rgb(var(--ft-accent-rgb) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Archivo', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['IBM Plex Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        // 10/11px labels and readouts, on the 4px spacing step.
        micro: ['0.6875rem', { lineHeight: '1rem' }],
        label: ['0.625rem', { lineHeight: '0.875rem' }],
      },
      letterSpacing: {
        // Wide tracking on 10px type is the templated tell; 0.055em is enough.
        label: '0.055em',
      },
      borderRadius: {
        panel: '3px',
        control: '2px',
      },
      boxShadow: {
        panel: 'var(--ft-shadow)',
      },
      spacing: {
        rail: '40px',
        drawer: '316px',
      },
    },
  },
  plugins: [],
};

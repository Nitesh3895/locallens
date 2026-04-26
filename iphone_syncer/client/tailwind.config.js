/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0f0f0f',
        surface: '#1a1a1a',
        elevated: '#222222',
        overlay: '#2a2a2a',
        'text-primary': '#f0ede8',
        'text-secondary': '#9e9a94',
        'text-tertiary': '#5a5752',
        amber: {
          DEFAULT: '#f59e0b',
          dim: 'rgba(245,158,11,0.15)',
        },
        green: {
          DEFAULT: '#10b981',
          dim: 'rgba(16,185,129,0.12)',
        },
        red: {
          DEFAULT: '#ef4444',
          dim: 'rgba(239,68,68,0.12)',
        },
        blue: {
          DEFAULT: '#3b82f6',
        },
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '12px',
        lg: '20px',
        xl: '28px',
      },
    },
  },
  plugins: [],
};

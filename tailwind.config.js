/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['Instrument Serif', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // One accent, six steps. Every saturated colour in the app comes from here.
        gold: {
          50: '#fdf9ec',
          100: '#f9efc8',
          200: '#f1dc93',
          300: '#e6c25c',
          400: '#d8a53a',
          500: '#b98724',
          600: '#93661b',
        },
        ink: {
          0: '#08080a',
          50: '#0b0b0e',
          100: '#101014',
          200: '#16161b',
          300: '#1e1e25',
          400: '#2a2a33',
        },
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.75rem',
      },
      letterSpacing: {
        tightest: '-0.045em',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 8s linear infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        'float-slow': 'floatY 7s ease-in-out infinite',
        'fade-up': 'slideUpFade 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        floatY: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { gx: { bg: '#05070f', panel: '#0d1326', line: '#1f2a4d', accent: '#ff3b5c', blue: '#3b82ff', gold: '#ffd23f' } },
      fontFamily: { display: ['"Segoe UI"', '"Helvetica Neue"', 'Arial', 'sans-serif'] },
    },
  },
  plugins: [],
};

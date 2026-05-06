/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4f46e5',
          dark: '#3730a3',
          light: '#818cf8',
        },
        surface: {
          DEFAULT: '#1a1a2e',
          elevated: '#16213e',
          card: '#0f3460',
        },
      },
    },
  },
  plugins: [],
};

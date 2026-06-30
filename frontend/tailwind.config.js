/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Retint the neutral surface used across the app (bg-gray-50) with a
        // faint brand-cool tint. Stays very light so all existing dark-on-surface
        // text keeps its WCAG AA / Section 508 contrast.
        gray: {
          50: '#eaf2f6',
        },
        teal: {
          50: '#e8f4f8',
          100: '#d0e9f2',
          400: '#5fb3d0',
          700: '#2a5f6f',
          800: '#1e4d5c',
          900: '#163d4a',
        },
      },
    },
  },
  plugins: [],
}

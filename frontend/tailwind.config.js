/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
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

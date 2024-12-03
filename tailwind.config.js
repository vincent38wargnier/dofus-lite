/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'damage-popup': {
          '0%': {
            opacity: '0',
            transform: 'translate(-50%, 0)'
          },
          '15%': {
            opacity: '1',
            transform: 'translate(-50%, -20px)'
          },
          '85%': {
            opacity: '1',
            transform: 'translate(-50%, -20px)'
          },
          '100%': {
            opacity: '0',
            transform: 'translate(-50%, -20px)'
          }
        }
      },
      animation: {
        'damage-popup': 'damage-popup 5s ease-out forwards'
      }
    },
  },
  plugins: [],
}
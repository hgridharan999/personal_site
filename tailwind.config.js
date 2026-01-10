/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: '#F5F1E8',
        ink: '#2C2C2C',
        'ink-accent': '#6B7A5C',
        highlight: '#C67B5C',
        fade: '#8A8A8A',
        line: '#D4CFC4',
        tape: 'rgba(200, 180, 150, 0.3)',
      },
      fontFamily: {
        handwritten: ['Caveat', 'cursive'],
        body: ['Indie Flower', 'cursive'],
        notes: ['Shadows Into Light', 'cursive'],
      },
      rotate: {
        '1': '1deg',
        '2': '2deg',
        '3': '3deg',
        '-1': '-1deg',
        '-2': '-2deg',
        '-3': '-3deg',
      },
      boxShadow: {
        'page': '0 4px 12px rgba(44, 44, 44, 0.08)',
        'page-hover': '0 8px 24px rgba(44, 44, 44, 0.12)',
        'photo': '0 2px 8px rgba(44, 44, 44, 0.15)',
        'tape': '0 1px 3px rgba(44, 44, 44, 0.1)',
      },
      animation: {
        'draw': 'draw 1.5s ease-out forwards',
        'fadeIn': 'fadeIn 0.8s ease-out forwards',
        'slideInLeft': 'slideInLeft 0.6s ease-out forwards',
        'dropIn': 'dropIn 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      },
      keyframes: {
        draw: {
          'from': { strokeDashoffset: '1000' },
          'to': { strokeDashoffset: '0' },
        },
        fadeIn: {
          'from': { opacity: '0', transform: 'translateY(10px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          'from': { opacity: '0', transform: 'translateX(-30px)' },
          'to': { opacity: '1', transform: 'translateX(0)' },
        },
        dropIn: {
          'from': { opacity: '0', transform: 'translateY(-20px) scale(0.95)' },
          'to': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
    },
  },
  plugins: [],
}

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
        ink: '#2C3E2D',
        'ink-accent': '#6B7A5C',
        highlight: '#C67B5C',
        line: '#D4CFC4',
        fade: '#8B9A7C',
      },
      fontFamily: {
        handwritten: ['Caveat', 'cursive'],
        body: ['Lora', 'serif'],
        notes: ['Patrick Hand', 'cursive'],
      },
      boxShadow: {
        'page': '2px 2px 0 rgba(44, 62, 45, 0.1)',
        'page-hover': '4px 4px 0 rgba(44, 62, 45, 0.15)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}

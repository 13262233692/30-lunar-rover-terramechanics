/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        'deep-space': '#0a0e17',
        'lunar-gray': '#8b8680',
        'mars-ochre': '#c45a2c',
        'cyber-cyan': '#00e5ff',
      },
      fontFamily: {
        'orbitron': ['Orbitron', 'monospace'],
        'source-sans': ['Source Sans 3', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

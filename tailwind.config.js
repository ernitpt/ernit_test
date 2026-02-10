/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './screens/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit_400Regular', 'sans-serif'],
        medium: ['Outfit_500Medium', 'sans-serif'],
        semibold: ['Outfit_600SemiBold', 'sans-serif'],
        bold: ['Outfit_700Bold', 'sans-serif'],
      },
    },
  },
  plugins: [],
};



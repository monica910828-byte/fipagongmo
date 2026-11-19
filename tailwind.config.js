/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        fipa: {
          blue: "#0A4E9B",
          darkblue: "#063266",
          navy: "#031C3D",
          sky: "#E8F2FD",
          accent: "#FF9900",
          yellow: "#FFE600",
        },
      },
    },
  },
  plugins: [],
};

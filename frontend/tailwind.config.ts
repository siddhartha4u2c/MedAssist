import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        clinical: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          600: "#0284c7",
          700: "#0369a1",
          900: "#0c4a6e",
        },
      },
    },
  },
  plugins: [],
};

export default config;

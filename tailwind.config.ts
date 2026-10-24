import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        // OSCL palette: near-black surfaces with a single lime accent.
        metal: {
          bg: "#050605",
          panel: "#0c0e0b",
          panel2: "#141712",
          row: "#090b08",
          rowAlt: "#10130e",
          line: "#232a20",
          text: "#f1f5ec",
          muted: "#97a08f",
          silver: "#6c7466",
          accent: "#b6ff2e",
          accentDark: "#4f7d0f",
          link: "#d6ff8a",
          head: "#151d0c"
        }
      },
      fontFamily: {
        sans: ["var(--font-body)", "Segoe UI", "Arial", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "sans-serif"]
      },
      boxShadow: {
        table: "0 0 0 1px rgba(35, 42, 32, 0.72)"
      }
    }
  },
  plugins: []
};

export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        gov: {
          navy: "#123B63",
          blue: "#1E5AA8",
          blueDark: "#17487F",
          saffron: "#F39A2F",
          saffronDark: "#C97A17",
          green: "#2E8B57",
          greenDark: "#20663F",
          lightBlue: "#EAF3FA",
          lightGreen: "#EDF7F1",
          offWhite: "#F7F8FA",
          ink: "#17202A",
          muted: "#5B6B7B",
          border: "#D5DDE5",
          red: "#B42318",
        },
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Noto Sans",
          "Noto Sans Telugu",
          "Gautami",
          "Nirmala UI",
          "Mangal",
          "sans-serif",
        ],
      },
      borderRadius: {
        gov: "6px",
      },
      boxShadow: {
        gov: "0 1px 3px rgba(18,59,99,0.12)",
        "gov-md": "0 2px 8px rgba(18,59,99,0.14)",
      },
    },
  },
  plugins: [],
};

export default config;

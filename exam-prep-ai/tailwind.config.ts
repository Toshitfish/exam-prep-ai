import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#FBF9F6",
        panel: "#FFFFFF",
        brand: {
          50: "#FFF7ED",
          500: "#F97316",
          600: "#EA580C",
        },
      },
      typography: {
        DEFAULT: {
          css: {
            blockquote: {
              borderLeftWidth: "4px",
              borderLeftColor: "#F97316",
              backgroundColor: "#FFF7ED",
              padding: "1rem",
              marginTop: "1.5rem",
              marginBottom: "1.5rem",
              fontStyle: "normal",
              color: "#374151",
              borderRadius: "0 0.5rem 0.5rem 0",
              fontWeight: "500",
              quotes: "none",
            },
            "blockquote p:first-of-type::before": { content: "none" },
            "blockquote p:last-of-type::after": { content: "none" },
            "blockquote p": { marginTop: "0", marginBottom: "0" },
            table: {
              width: "100%",
              tableLayout: "fixed",
              borderCollapse: "collapse",
              border: "1px solid #d1d5db",
              fontSize: "0.8125rem",
              lineHeight: "1.35",
            },
            thead: {
              backgroundColor: "#f9fafb",
            },
            "thead th": {
              border: "1px solid #d1d5db",
              padding: "0.45rem 0.55rem",
              fontWeight: "700",
              color: "#111827",
              textAlign: "left",
              verticalAlign: "top",
            },
            "tbody td": {
              border: "1px solid #d1d5db",
              padding: "0.42rem 0.55rem",
              color: "#1f2937",
              verticalAlign: "top",
            },
            "tbody tr:nth-child(even)": {
              backgroundColor: "#fcfcfd",
            },
            "tbody tr:hover": {
              backgroundColor: "#f8fafc",
            },
          },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;

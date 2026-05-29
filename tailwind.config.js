/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dae7ff",
          200: "#b9d0ff",
          300: "#8db0ff",
          400: "#5f86ff",
          500: "#3a5ef0",
          600: "#2a45c6",
          700: "#22369c",
          800: "#1d2c7a",
          900: "#172361"
        },
        accent: {
          500: "#8b5cf6",
          600: "#7c3aed"
        },
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a"
        }
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "sans-serif"
        ],
        mono: ["JetBrains Mono", "Menlo", "monospace"]
      },
      boxShadow: {
        "panel": "0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 4px 16px -4px rgba(15, 23, 42, 0.08)",
        "panel-strong": "0 4px 24px -6px rgba(34, 54, 156, 0.18)"
      }
    }
  },
  plugins: []
};

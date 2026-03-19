import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "var(--bg-primary)",
          secondary: "var(--bg-secondary)",
          card: "var(--bg-card)",
          input: "var(--bg-input)",
        },
        border: {
          DEFAULT: "var(--border-default)",
          light: "var(--border-light)",
          focus: "var(--border-focus)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
          faint: "var(--text-faint)",
          links: "var(--text-links)",
        },
        accent: {
          blue: "var(--accent-blue)",
          amber: "var(--accent-amber)",
          red: "var(--accent-red)",
          green: "var(--accent-green)",
          grey: "var(--accent-grey)",
        },
      },
      fontFamily: {
        sans: [
          "Neue Haas Grotesk Text",
          "Neue Haas Grotesk Text Fallback",
          "Helvetica Neue",
          "Helvetica",
          "sans-serif",
        ],
        mono: [
          "GT Flexa",
          "GT Flexa Fallback",
          "SF Mono",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        "2xs": ["9.5px", { lineHeight: "1.4" }],
        xs: ["11px", { lineHeight: "1.4" }],
        sm: ["12.5px", { lineHeight: "1.5" }],
        base: ["13px", { lineHeight: "1.5" }],
        lg: ["15px", { lineHeight: "1.35" }],
        xl: ["18px", { lineHeight: "1.3" }],
      },
      borderRadius: {
        sm: "3px",
        DEFAULT: "6px",
        md: "6px",
        lg: "8px",
        xl: "10px",
      },
      spacing: {
        "4.5": "18px",
      },
      boxShadow: {
        "level-0": "none",
        "level-1": "0 1px 4px rgba(0, 0, 0, 0.04)",
        "level-2": "0 4px 16px rgba(0, 0, 0, 0.06)",
        "level-3": "0 12px 40px rgba(0, 0, 0, 0.06)",
        "level-3-dark": "0 12px 40px rgba(0, 0, 0, 0.25)",
      },
      letterSpacing: {
        tight: "-0.02em",
        tighter: "-0.03em",
        label: "0.06em",
        "label-wide": "0.1em",
      },
      transitionDuration: {
        "120": "120ms",
        "150": "150ms",
        "200": "200ms",
      },
      keyframes: {
        fadeInReasoning: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmerAi: {
          "0%": { backgroundPosition: "100% 0" },
          "100%": { backgroundPosition: "0% 0" },
        },
        "collapsible-down": {
          from: { height: "0" },
          to: { height: "var(--radix-collapsible-content-height)" },
        },
        "collapsible-up": {
          from: { height: "var(--radix-collapsible-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "fade-in-reasoning": "fadeInReasoning 0.35s ease-out both",
        "shimmer-ai":
          "shimmerAi var(--shimmer-ai-duration, 2.8s) linear infinite",
        "collapsible-down": "collapsible-down 0.2s ease-out",
        "collapsible-up": "collapsible-up 0.2s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;

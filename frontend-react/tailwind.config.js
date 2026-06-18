/** @type {import('tailwindcss').Config} */

// ── HUD / Control-room palette ───────────────────────────────────────────────
// Neutral structure: warm charcoal → bone (replaces slate/gray families)
const charcoal = {
    50: "#f4f3ee", 100: "#e8e6df", 200: "#d2cfc4", 300: "#aba89c",
    400: "#86847a", 500: "#605f58", 600: "#454540", 700: "#2c2c2e",
    800: "#1b1b1e", 900: "#121214", 950: "#0a0a0b",
};
// Primary accent: phosphor amber (replaces cyan/orange/amber/yellow)
const amber = {
    50: "#fff8e6", 100: "#ffecbf", 200: "#ffd97a", 300: "#ffc647",
    400: "#ffb000", 500: "#e69a00", 600: "#b87800", 700: "#8a5a00",
    800: "#5c3c00", 900: "#2e1e00", 950: "#1a1100",
};
// Phosphor green: "OK / nominal" (replaces emerald/green/teal/lime)
const phosphor = {
    50: "#e6fff4", 100: "#b3ffe0", 200: "#6affc4", 300: "#1fffa8",
    400: "#00d97e", 500: "#00b86a", 600: "#009455", 700: "#006e40",
    800: "#00482a", 900: "#002417", 950: "#00120c",
};
// Alarm red (replaces red/rose/pink)
const alarm = {
    50: "#ffe9e7", 100: "#ffc9c4", 200: "#ff9a92", 300: "#ff6b5e",
    400: "#ff3b30", 500: "#e62217", 600: "#b81a12", 700: "#8a130d",
    800: "#5c0d09", 900: "#2e0604", 950: "#1a0302",
};
// Steel cyan: secondary data (replaces blue/sky/indigo/violet/purple/fuchsia)
const steel = {
    50: "#eaf6f9", 100: "#c6e8ef", 200: "#8fd2de", 300: "#4fb6c8",
    400: "#2a9bb0", 500: "#1f7e90", 600: "#186374", 700: "#134b58",
    800: "#0d333c", 900: "#071a20", 950: "#040d10",
};

export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                // Recolor the families already used across the app so the whole
                // UI adopts the HUD look without editing every component.
                slate: charcoal, gray: charcoal, zinc: charcoal, neutral: charcoal, stone: charcoal,
                cyan: amber, orange: amber, amber: amber, yellow: amber,
                emerald: phosphor, green: phosphor, teal: phosphor, lime: phosphor,
                red: alarm, rose: alarm, pink: alarm,
                blue: steel, sky: steel, indigo: steel, violet: steel, purple: steel, fuchsia: steel,
                // Named families for new hand-built HUD components
                charcoal, phosphor, steel, alarm,
                // Landing "Telemetría" signal hue (oscilloscope trace) + true void
                trace: "#38E1C6",
                void: "#07090A",
                // Semantic tokens for new hand-built HUD components
                hud: {
                    bg: "#0a0a0b", panel: "#121214", line: "#26262b",
                    bone: "#e8e6df", dim: "#86847a",
                    amber: "#ffb000", green: "#00d97e", alarm: "#ff3b30", steel: "#2a9bb0",
                },
                background: "#0a0a0b", surface: "#121214",
                primary: "#ffb000", secondary: "#2a9bb0", danger: "#ff3b30", warning: "#ffb000",
            },
            fontFamily: {
                sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
                mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
                display: ['"IBM Plex Mono"', "monospace"],
                // Landing display face — technical mono with character
                martian: ['"Martian Mono"', '"IBM Plex Mono"', "monospace"],
            },
            // Square everything off — kill the rounded-2xl "AI card" look
            borderRadius: {
                none: "0", sm: "1px", DEFAULT: "2px", md: "2px",
                lg: "2px", xl: "3px", "2xl": "3px", "3xl": "4px",
            },
            letterSpacing: { widest: "0.25em" },
            boxShadow: {
                hud: "0 0 0 1px #26262b",
                glow: "0 0 24px -6px rgba(255,176,0,0.35)",
            },
        },
    },
    plugins: [],
};

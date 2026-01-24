/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "#0f172a", // Slate 900
                surface: "#1e293b",    // Slate 800
                primary: "#10b981",    // Emerald 500
                secondary: "#3b82f6",  // Blue 500
                danger: "#ef4444",     // Red 500
                warning: "#f59e0b",    // Amber 500
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
        },
    },
    plugins: [],
}

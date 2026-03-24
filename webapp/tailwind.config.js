module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#000000",
        secondary: "#000000",
        base: "#ffffff",
      },
    },
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      {
        tunecamp: {
          "primary": "#000000",
          "secondary": "#000000",
          "accent": "#000000",
          "neutral": "#000000",
          "base-100": "#ffffff",
          "base-200": "#f5f5f5",
          "base-300": "#e5e5e5",
          "info": "#000000",
          "success": "#000000",
          "warning": "#000000",
          "error": "#000000",
          "--rounded-box": "0",
          "--rounded-btn": "0",
          "--rounded-badge": "0",
          "--tab-radius": "0",
          "--animation-btn": "0.1s",
          "--btn-focus-scale": "0.98",
          "--border-btn": "1px",
        },
      },
    ],
  },
}

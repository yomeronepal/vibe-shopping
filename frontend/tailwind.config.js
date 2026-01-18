/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "primary": "#8A2BE2", // Vibe Purple
        "background-light": "#f7f6f8",
        "background-dark": "#191121",
        "vibe-lavender": "#F4ECFB",
        "vibe-surface": "#FCFAFD",
        // Keep existing Tailwind default colors if needed, or rely on defaults.
        // Merging user request with existing config structure if needed. 
        // NOTE: The previous config had deep objects for primary/secondary. 
        // The user request specified a specific primary color. 
        // To be safe and follow the 'premium' design, I will add the user's specific colors
        // while strictly following the requested design system.
        // Re-adding the user's specific requested colors overwriting/extending current ones.

        // Choose Path Specific Colors
        "cp-primary": "#8a2ce2",
        "cp-bg-light": "#dcbedf",
        "cp-bg-dark": "#3e2b4f",
      },
      fontFamily: {
        "display": ["Spline Sans", "Plus Jakarta Sans", "Manrope", "sans-serif"],
        "jakarta": ["Plus Jakarta Sans", "sans-serif"],
        "sans": ['Inter', 'system-ui', 'sans-serif'], // Keep existing sans-serif fallback
      },
      borderRadius: {
        "DEFAULT": "0.5rem",
        "lg": "1rem",
        "xl": "1.5rem",
        "3xl": "24px",
        "full": "9999px"
      },
      boxShadow: {
        "glow": "0 0 20px rgba(138, 43, 226, 0.25)",
        "glass": "0 8px 32px 0 rgba(31, 38, 135, 0.07)",
      },
      // Keeping existing animations as they might be used elsewhere
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-down': 'slideDown 0.5s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}

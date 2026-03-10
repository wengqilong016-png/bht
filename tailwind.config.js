/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      boxShadow: {
        'silicone': '4px 4px 12px rgba(0, 0, 0, 0.15), -4px -4px 12px rgba(255, 255, 255, 0.8)',
        'silicone-sm': '2px 2px 6px rgba(0, 0, 0, 0.1), -2px -2px 6px rgba(255, 255, 255, 0.7)',
        'silicone-pressed': 'inset 4px 4px 12px rgba(0, 0, 0, 0.15), inset -4px -4px 12px rgba(255, 255, 255, 0.8)',
        'silicone-dark': '4px 4px 12px rgba(0, 0, 0, 0.5), -4px -4px 12px rgba(255, 255, 255, 0.05)',
      },
      backgroundImage: {
        'silicone-gradient': 'linear-gradient(135deg, #e6e8eb 0%, #f5f7fa 100%)',
        'silicone-dark-gradient': 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      }
    },
  },
  plugins: [],
}


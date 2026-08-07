/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        page: '#0b0c0f',
        surface: {
          DEFAULT: '#15161a',
          2: '#1c1e24',
          3: '#23262e'
        },
        line: 'rgba(255,255,255,0.07)',
        ink: {
          DEFAULT: '#f7f8f8',
          dim: '#a6adbb',
          faint: '#6b7280'
        },
        accent: {
          DEFAULT: '#e0a458',
          soft: 'rgba(224,164,88,0.13)',
          line: 'rgba(224,164,88,0.35)'
        },
        stock: {
          ok: '#34d399',
          transit: '#f6b45a',
          sold: '#8b93a3',
          risk: '#f87171'
        }
      },
      fontFamily: {
        display: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      fontSize: {
        xs: ['11.5px', '1.5'],
        sm: ['13px', '1.55'],
        base: ['14.5px', '1.55']
      },
      borderRadius: {
        DEFAULT: '6px',
        md: '8px',
        xl: '12px',
        '2xl': '16px'
      },
      boxShadow: {
        raise: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.35)',
        pop: '0 1px 2px rgba(0,0,0,0.45), 0 16px 48px rgba(0,0,0,0.55)'
      },
      keyframes: {
        rise: {
          '0%': { transform: 'translateY(6px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        fade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        }
      },
      animation: {
        rise: 'rise .4s cubic-bezier(0.22,1,0.36,1) both',
        fade: 'fade .25s ease-out both'
      }
    }
  },
  plugins: []
};

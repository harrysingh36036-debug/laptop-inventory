/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        page: '#06121c',
        surface: {
          DEFAULT: '#0d1b2a',
          2: '#13263a',
          3: '#19324b'
        },
        line: 'rgba(159,183,206,0.13)',
        ink: {
          DEFAULT: '#edf6ff',
          dim: '#9fb7ce',
          faint: '#6f88a3'
        },
        accent: {
          DEFAULT: '#5cc8ff',
          soft: 'rgba(92,200,255,0.14)',
          line: 'rgba(92,200,255,0.42)'
        },
        stock: {
          ok: '#3dd9a1',
          transit: '#ffd166',
          sold: '#7c91a8',
          risk: '#ff7b91'
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

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        page: '#ffffff',
        surface: {
          DEFAULT: '#ffffff',
          2: '#f8fafc',
          3: '#f1f5f9'
        },
        line: '#e2e8f0',
        ink: {
          DEFAULT: '#0f172a',
          dim: '#334155',
          faint: '#64748b'
        },
        accent: {
          DEFAULT: '#2563eb',
          soft: 'rgba(37,99,235,0.08)',
          line: 'rgba(37,99,235,0.2)'
        },
        stock: {
          ok: '#059669',
          transit: '#d97706',
          sold: '#64748b',
          risk: '#dc2626'
        }
      },
      fontFamily: {
        display: ['Fira Sans', 'system-ui', 'sans-serif'],
        sans: ['Fira Sans', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'system-ui', 'monospace']
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
        raise: '0 1px 2px rgba(15,23,42,0.04)',
        pop: '0 1px 2px rgba(15,23,42,0.06)'
      }
    }
  },
  plugins: []
};
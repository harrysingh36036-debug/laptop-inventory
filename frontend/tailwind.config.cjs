/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        page: '#ffffff',
        surface: {
          DEFAULT: '#ffffff',
          2: '#f2f5f8',
          3: '#e8edf2'
        },
        line: 'rgba(15,23,42,0.1)',
        ink: {
          DEFAULT: '#0f172a',
          dim: '#334155',
          faint: '#64748b'
        },
        accent: {
          DEFAULT: '#2563eb',
          soft: 'rgba(37,99,235,0.1)',
          line: 'rgba(37,99,235,0.32)'
        },
        stock: {
          ok: '#059669',
          transit: '#b45309',
          sold: '#64748b',
          risk: '#dc2626'
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
        raise: '0 1px 2px rgba(15,23,42,0.06), 0 8px 24px rgba(15,23,42,0.08)',
        pop: '0 1px 2px rgba(15,23,42,0.08), 0 16px 48px rgba(15,23,42,0.14)'
      }
    }
  },
  plugins: []
};
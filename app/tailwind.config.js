/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 治愈系强调色（鼠尾草绿），浅/暗主题共用
        sage: {
          50: '#eef6f3', 100: '#dcebe6', 200: '#bfdcd4', 300: '#9ccabf',
          400: '#7bbbac', 500: '#5fa896', 600: '#4c8f80', 700: '#3d7266',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text',
          'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'sans-serif',
        ],
      },
      borderRadius: {
        xl: '14px', '2xl': '20px', '3xl': '26px',
      },
      boxShadow: {
        soft: '0 1px 3px rgba(40,38,52,.05), 0 8px 28px rgba(40,38,52,.06)',
        'soft-sm': '0 1px 2px rgba(40,38,52,.04), 0 4px 14px rgba(40,38,52,.05)',
      },
    },
  },
  plugins: [],
}

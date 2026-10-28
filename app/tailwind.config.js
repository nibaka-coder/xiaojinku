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
        // 语义色：全部指向 index.css 的 CSS 变量，随 .dark 自动切换
        // 命名说明：文字色用 ink（避开 text-* 前缀歧义）；页面底色用 app（避免生成 bg-bg）
        app: 'var(--bg)',
        surface: 'var(--bg-soft)',
        card: { DEFAULT: 'var(--card)', 2: 'var(--card-2)' },
        ink: { DEFAULT: 'var(--text)', sub: 'var(--text-sub)', faint: 'var(--text-faint)' },
        accent: { DEFAULT: 'var(--accent)', strong: 'var(--accent-strong)', soft: 'var(--accent-soft)' },
        // 图形用原色（柔和），文字用 -text 加深档（浅色下原色仅 2.0:1，加深档 ≥4.9:1）
        expense: { DEFAULT: 'var(--expense)', soft: 'var(--expense-soft)', text: 'var(--expense-text)' },
        income: { DEFAULT: 'var(--income)', soft: 'var(--income-soft)', text: 'var(--income-text)' },
        credit: { DEFAULT: 'var(--credit)', soft: 'var(--credit-soft)', text: 'var(--credit-text)' },
        warn: 'var(--warn)',
        danger: { DEFAULT: 'var(--danger)', text: 'var(--danger-text)' },
        glass: 'var(--glass)',
      },
      borderColor: {
        soft: 'var(--border)',
        strong: 'var(--border-strong)',
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text',
          'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'sans-serif',
        ],
      },
      borderRadius: {
        xl: '14px', '2xl': '20px', '3xl': '26px',
        // 语义档位：消除 20/16/14/12 散写
        tag: '999px',   // 标签 / pill / chip
        btn: '14px',    // 按钮 / 输入框
        card: '20px',   // 卡片
        sheet: '26px',  // 弹层 / 大容器
      },
      boxShadow: {
        soft: '0 1px 3px rgba(40,38,52,.05), 0 8px 28px rgba(40,38,52,.06)',
        'soft-sm': '0 1px 2px rgba(40,38,52,.04), 0 4px 14px rgba(40,38,52,.05)',
      },
    },
  },
  plugins: [],
}

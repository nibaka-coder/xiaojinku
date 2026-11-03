import { useState } from 'react'
import { Outlet, useLocation, useNavigate, NavLink } from 'react-router-dom'
import { Icon, Glyph } from '@/components/Icon'

type NavChild = { to: string; label: string }
type NavItem =
  | { to: string; label: string; icon: string; single: true }
  | { label: string; icon: string; children: NavChild[] }

const NAV: NavItem[] = [
  { to: '/', label: '概览', icon: 'leaf', single: true },
  {
    label: '日常开销',
    icon: 'receipt',
    children: [
      { to: '/add', label: '记账' },
      { to: '/transactions', label: '流水' },
      { to: '/statistics', label: '统计' },
    ],
  },
  {
    label: '投资管理',
    icon: 'chart',
    children: [
      { to: '/invest/holdings', label: '持仓总览' },
      { to: '/invest/trades', label: '交易记录' },
      { to: '/invest/dividends', label: '分红助手' },
    ],
  },
  { to: '/settings', label: '设置', icon: 'gear', single: true },
]

const DAILY = ['/add', '/transactions', '/statistics']
const DAILY_LABELS = ['记账', '流水', '统计']

const INVEST = ['/invest/holdings', '/invest/trades', '/invest/dividends']
const INVEST_LABELS = ['持仓', '记录', '分红']

// 移动端顶部栏显示当前页名；页面内的大标题只在桌面端保留（侧边栏高亮已指示位置）
const PAGE_TITLES: Record<string, string> = {
  '/': '概览',
  '/add': '记账',
  '/transactions': '流水',
  '/statistics': '统计',
  '/invest/holdings': '持仓总览',
  '/invest/trades': '交易记录',
  '/invest/dividends': '分红助手',
  '/invest/add': '记一笔投资',
  '/settings': '设置',
}
function pageTitle(path: string): string {
  if (PAGE_TITLES[path]) return PAGE_TITLES[path]
  if (path.startsWith('/settings/')) return '设置'
  return '小金库'
}

function isActiveGroup(item: NavItem, path: string): boolean {
  if (item.single) return path === item.to
  return item.children.some((c) => path === c.to || path.startsWith(c.to + '/'))
}

function childActive(childTo: string, path: string): boolean {
  return path === childTo || path.startsWith(childTo + '/')
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 日常开销: true })
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname
  const inDaily = DAILY.includes(path)
  const inInvest = INVEST.includes(path)

  const toggleGroup = (label: string) =>
    setExpanded((e) => ({ ...e, [label]: !e[label] }))

  const Sidebar = (
    <nav className="flex flex-col gap-1 px-3 py-3">
      <div className="flex items-center gap-2 px-2 py-3 mb-1">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}
        >
          <Icon name="leaf" size={18} />
        </div>
        <span className="text-[15px] font-semibold text-main">小金库</span>
      </div>
      {NAV.map((item) =>
        item.single ? (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={() => setOpen(false)}
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          >
            <span className="w-5 h-5 flex items-center justify-center shrink-0">
              <Glyph value={item.icon} size={19} />
            </span>
            <span>{item.label}</span>
          </NavLink>
        ) : (
          <div key={item.label}>
            <button
              onClick={() => toggleGroup(item.label)}
              className={`nav-link w-full ${isActiveGroup(item, path) ? 'nav-link-active' : ''}`}
            >
              <span className="w-5 h-5 flex items-center justify-center shrink-0">
                <Glyph value={item.icon} size={19} />
              </span>
              <span className="flex-1 text-left">{item.label}</span>
              <Icon name={expanded[item.label] ? 'chevronDown' : 'chevron'} size={14} />
            </button>
            {expanded[item.label] && (
              <div className="mt-0.5 mb-1">
                {item.children.map((c) => (
                  <NavLink
                    key={c.to}
                    to={c.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `nav-sub ${childActive(c.to, path) ? 'nav-sub-active' : ''}`
                    }
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
                    {c.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )
      )}
      <div className="mt-auto px-3 py-3 text-xs text-faint">本地数据 · 隐私优先</div>
    </nav>
  )

  return (
    <div className="min-h-full flex bg-app">
      {/* 桌面侧边栏（毛玻璃） */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-soft bg-glass backdrop-blur-xl sticky top-0 h-screen">
        {Sidebar}
      </aside>

      {/* 移动端抽屉 */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside
            className="absolute left-0 top-0 bottom-0 w-64 bg-app border-r border-soft overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {Sidebar}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* 移动端顶部栏：显示当前页名，不再重复品牌名 + 页面标题 */}
        <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 bg-glass backdrop-blur-xl border-b border-soft px-4 h-14">
          <button onClick={() => setOpen(true)} className="text-sub leading-none" aria-label="打开菜单">
            <Icon name="menu" size={20} />
          </button>
          <span className="font-semibold text-main">{pageTitle(path)}</span>
          <button
            onClick={() => navigate('/settings')}
            className="ml-auto text-sub leading-none"
            aria-label="设置"
          >
            <Icon name="gear" size={19} />
          </button>
        </header>

        <main className="flex-1 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-10 pt-4 md:px-8 md:pt-6 w-full">
          <div className="max-w-3xl mx-auto w-full">
            {/* 移动端：日常开销 / 投资管理 分段切换（导航机制不变） */}
            {inDaily && (
              <div className="md:hidden mb-4">
                <div className="seg w-full">
                  {DAILY.map((to, i) => (
                    <button
                      key={to}
                      onClick={() => navigate(to)}
                      className={`seg-item flex-1 ${path === to ? 'seg-item-active' : ''}`}
                    >
                      {DAILY_LABELS[i]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {inInvest && (
              <div className="md:hidden mb-4">
                <div className="seg w-full">
                  {INVEST.map((to, i) => (
                    <button
                      key={to}
                      onClick={() => navigate(to)}
                      className={`seg-item flex-1 ${path === to ? 'seg-item-active' : ''}`}
                    >
                      {INVEST_LABELS[i]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Outlet />
          </div>
        </main>
      </div>

      {/* 移动端底部 Tab */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-glass backdrop-blur-xl border-t border-soft"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-stretch justify-around h-16">
          {NAV.filter((n) => n.single === true || n.label === '日常开销' || n.label === '投资管理').map(
            (item) => {
              const active = item.single
                ? path === (item as any).to
                : item.children.some((c: any) => path === c.to || path.startsWith(c.to + '/'))
              const target = item.single ? (item as any).to : item.children[0].to
              const icon = item.icon
              const label = item.label
              return (
                <button
                  key={label}
                  onClick={() => navigate(target)}
                  className={`flex flex-col items-center justify-center gap-0.5 flex-1 ${
                    active ? 'text-sage-600' : 'text-faint'
                  }`}
                >
                  <Glyph value={icon} size={20} />
                  <span className="text-[11px] font-medium">{label}</span>
                </button>
              )
            }
          )}
        </div>
      </nav>
    </div>
  )
}

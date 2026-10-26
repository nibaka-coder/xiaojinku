import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import { cashBalance, investSummary, liabilitiesTotal, netWorth } from '@/lib/calc'
import { fmtMoney } from '@/lib/money'
import type { ThemeMode } from '@/types'

// 设置首页：只放分组入口，具体设置各自进子页，避免一屏塞满九个区块
type Item = { to: string; label: string; hint: string; icon: string }

function Group({ title, items }: { title: string; items: Item[] }) {
  return (
    <div>
      <div className="text-xs text-faint px-1 mb-1.5">{title}</div>
      <div className="card !p-0">
        {items.map((it, i) => (
          <div key={it.to} className={i < items.length - 1 ? 'border-b border-soft' : ''}>
            <Row item={it} />
          </div>
        ))}
      </div>
    </div>
  )
}

function Row({ item }: { item: Item }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(item.to)}
      className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[var(--card-2)]"
    >
      <span className="w-7 h-7 rounded-lg flex items-center justify-center text-base bg-card-2 shrink-0">
        {item.icon}
      </span>
      <span className="flex-1 text-main text-sm">{item.label}</span>
      <span className="text-xs text-faint truncate max-w-[45%]">{item.hint}</span>
      <span className="text-faint text-sm shrink-0">›</span>
    </button>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const settings = useStore((s) => s.settings)
  const transactions = useStore((s) => s.transactions)
  const liabilities = useStore((s) => s.liabilities)
  const securities = useStore((s) => s.securities)
  const investTxns = useStore((s) => s.investTxns)
  const fxRate = settings.fxRate.rate
  const hkdRate = settings.hkdRate.rate

  const nw = useMemo(
    () =>
      netWorth(
        transactions,
        liabilities,
        settings.cashOpening,
        securities,
        investTxns,
        fxRate,
        hkdRate
      ),
    [transactions, liabilities, settings.cashOpening, securities, investTxns, fxRate, hkdRate]
  )
  const cash = useMemo(
    () => cashBalance(transactions, settings.cashOpening),
    [transactions, settings.cashOpening]
  )
  const investMarket = useMemo(
    () => investSummary(securities, investTxns, fxRate, hkdRate).marketCNY,
    [securities, investTxns, fxRate, hkdRate]
  )
  const loanCount = liabilities.filter((l) => l.kind !== 'credit').length
  const liabTotal = useMemo(
    () => liabilitiesTotal(liabilities, transactions),
    [liabilities, transactions]
  )
  const themeLabel: Record<ThemeMode, string> = {
    light: '浅色',
    dark: '深色',
    system: '跟随系统',
  }
  const backupText = settings.lastBackupAt
    ? `${settings.lastBackupAt.slice(0, 10)}（${Math.floor(
        (Date.now() - new Date(settings.lastBackupAt).getTime()) / 86400000
      )} 天前）`
    : '从未备份'

  const groups: { title: string; items: Item[] }[] = [
    {
      title: '数据与资产',
      items: [
        { to: '/settings/balance', label: '资产负债', hint: fmtMoney(nw, 'CNY'), icon: '💰' },
        {
          to: '/settings/liabilities',
          label: '长期负债',
          hint: loanCount ? `${loanCount} 项 · ${fmtMoney(liabTotal, 'CNY', { compact: true })}` : '暂无',
          icon: '🚗',
        },
        { to: '/settings/categories', label: '分类管理', hint: '收支分类', icon: '🗂' },
        { to: '/settings/data', label: '数据备份与导入', hint: backupText, icon: '📦' },
      ],
    },
    {
      title: '偏好',
      items: [
        { to: '/settings/appearance', label: '外观', hint: themeLabel[settings.theme], icon: '🎨' },
        {
          to: '/settings/lock',
          label: '应用锁',
          hint: settings.appLockEnabled ? '已开启' : '未开启',
          icon: '🔒',
        },
        {
          to: '/settings/fx',
          label: '汇率',
          hint: `USD ${settings.fxRate.rate} · HKD ${settings.hkdRate.rate}`,
          icon: '💱',
        },
        {
          to: '/settings/invest',
          label: '投资设置',
          hint: (settings.costBasis ?? 'actual') === 'actual' ? '真实成本' : '摊薄成本',
          icon: '📈',
        },
      ],
    },
    {
      title: '同步',
      items: [
        {
          to: '/settings/sync',
          label: '云同步',
          hint: settings.sync.enabled ? '已启用' : '未启用',
          icon: '☁️',
        },
      ],
    },
  ]

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-main">设置</h1>

      {/* 净资产速览：最常用的一个数，点开进资产负债 */}
      <button
        className="card w-full text-left"
        onClick={() => navigate('/settings/balance')}
      >
        <div className="text-xs text-sub">净资产</div>
        <div className="text-2xl font-semibold text-main mt-0.5 tabular-nums">
          {fmtMoney(nw, 'CNY')}
        </div>
        <div className="grid grid-cols-2 gap-x-4 mt-3 text-xs">
          <div className="flex justify-between">
            <span className="text-faint">现金</span>
            <span className="text-sub">{fmtMoney(cash, 'CNY', { compact: true })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-faint">投资市值</span>
            <span className="text-sub">{fmtMoney(investMarket, 'CNY', { compact: true })}</span>
          </div>
        </div>
      </button>

      {groups.map((g) => (
        <Group key={g.title} title={g.title} items={g.items} />
      ))}

      <p className="text-center text-xs text-faint pt-1">小金库 · 本地数据 · 隐私优先</p>
    </div>
  )
}

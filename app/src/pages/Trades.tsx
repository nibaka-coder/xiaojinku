import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import { fmtMoney } from '@/lib/money'
import { deriveLots } from '@/lib/calc'
import { fmtDate } from '@/lib/date'
import type { InvestTxnType } from '@/types'
import Modal from '@/components/Modal'

const TXN_LABEL: Record<InvestTxnType, string> = { buy: '买入', sell: '卖出', dividend: '分红' }
const TXN_COLOR: Record<InvestTxnType, string> = {
  buy: 'var(--accent-strong)',
  sell: 'var(--sub)',
  dividend: 'var(--income)',
}

const FILTERS: { key: InvestTxnType | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'buy', label: '买入' },
  { key: 'sell', label: '卖出' },
  { key: 'dividend', label: '分红' },
]

function txnAmount(t: { type: InvestTxnType; shares: number; price: number; fee: number }): number {
  if (t.type === 'dividend') return (t.shares > 0 ? t.shares * t.price : t.price) + t.fee
  return t.shares * t.price + t.fee
}

// 红涨绿跌（仅投资模块）
function colorOf(v: number): string {
  return v >= 0 ? 'var(--expense)' : 'var(--income)'
}
function sign(v: number): string {
  return v >= 0 ? '+' : ''
}

export default function Trades() {
  const navigate = useNavigate()
  const securities = useStore((s) => s.securities)
  const investTxns = useStore((s) => s.investTxns)
  const fxRate = useStore((s) => s.settings.fxRate.rate)
  const hkdRate = useStore((s) => s.settings.hkdRate.rate)
  const deleteInvestTxn = useStore((s) => s.deleteInvestTxn)
  const refreshQuotes = useStore((s) => s.refreshQuotes)
  const [filter, setFilter] = useState<InvestTxnType | 'all'>('all')
  const [secFilter, setSecFilter] = useState('all')
  const [delId, setDelId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const secMap = useMemo(() => new Map(securities.map((s) => [s.id, s])), [securities])
  const derived = useMemo(
    () => deriveLots(securities, investTxns, fxRate, hkdRate),
    [securities, investTxns, fxRate, hkdRate]
  )
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const onRefresh = async () => {
    setRefreshing(true)
    await refreshQuotes(true)
    setRefreshing(false)
  }

  const list = useMemo(
    () =>
      investTxns
        .filter((t) => (filter === 'all' ? true : t.type === filter))
        .filter((t) => (secFilter === 'all' ? true : t.security_id === secFilter))
        .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime()),
    [investTxns, filter, secFilter]
  )

  const del = () => {
    if (delId) deleteInvestTxn(delId)
    setDelId(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-main">交易记录</h1>
        <div className="flex items-center gap-2">
          <button className="btn-ghost text-sm" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? '刷新中…' : '↻ 刷新行情'}
          </button>
          <button className="btn-ghost text-sm" onClick={() => navigate('/invest/add')}>
            ＋ 记一笔
          </button>
        </div>
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`chip ${filter === f.key ? 'chip-active' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <select className="input" value={secFilter} onChange={(e) => setSecFilter(e.target.value)}>
        <option value="all">全部证券</option>
        {securities.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}（{s.code}）
          </option>
        ))}
      </select>

      {list.length === 0 ? (
        <div className="card text-center py-12 text-sub">暂无交易记录</div>
      ) : (
        <div className="space-y-2">
          {list.map((t) => {
            const sec = secMap.get(t.security_id)
            const isBuy = t.type === 'buy'
            const fx = t.currency === 'USD' ? fxRate : t.currency === 'HKD' ? hkdRate : 1
            const cur = isBuy ? sec?.lastPrice ?? sec?.manualPrice : undefined
            // 该笔买入相对现价的浮动盈亏（原币）
            const plOrig = cur !== undefined ? (cur - t.price) * t.shares - t.fee : 0
            const costOrig = t.price * t.shares + t.fee
            const plPct = costOrig > 0 ? (plOrig / costOrig) * 100 : 0
            const match = t.type === 'sell' ? derived.sells[t.id] : undefined
            const lot = isBuy ? (derived.lots[t.security_id] ?? []).find((l) => l.lotId === t.id) : undefined
            const expandedThis = !!expanded[t.id]
            const sellCost = match ? match.matched.reduce((a, m) => a + m.shares * m.costPerShare, 0) : 0
            const sellPct = sellCost > 0 ? (match!.realizedPL / sellCost) * 100 : 0
            return (
              <div key={t.id} className="card-2">
                <div className="flex items-center gap-3">
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0"
                    style={{ color: TXN_COLOR[t.type], background: 'var(--card-2)' }}
                  >
                    {TXN_LABEL[t.type]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-main truncate">{sec?.name ?? '已删除证券'}</div>
                    <div className="text-xs text-faint">
                      {fmtDate(t.datetime)} ·{' '}
                      {t.type === 'dividend' ? `每股 ${fmtMoney(t.price, t.currency)}` : `${t.shares} 股 × ${fmtMoney(t.price, t.currency)}`}
                    </div>
                    {isBuy && lot && (
                      lot.remaining <= 0 ? (
                        <div className="text-xs" style={{ color: colorOf(derived.lotRealized[lot.lotId] ?? 0) }}>
                          已清仓 · 共{sign(derived.lotRealized[lot.lotId] ?? 0)}
                          {fmtMoney(derived.lotRealized[lot.lotId] ?? 0, t.currency)}（≈
                          {fmtMoney((derived.lotRealized[lot.lotId] ?? 0) * fx, 'CNY')}）
                        </div>
                      ) : (
                        <div className="text-xs text-faint">持仓中（剩 {lot.remaining} 股）</div>
                      )
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className="font-semibold"
                      style={{ color: t.type === 'sell' || t.type === 'dividend' ? 'var(--income)' : 'var(--text)' }}
                    >
                      {fmtMoney(txnAmount(t), t.currency)}
                    </div>
                    {t.type === 'sell' && match ? (
                      <div>
                        <div className="text-xs" style={{ color: colorOf(match.realizedPL) }}>
                          已实现 {sign(match.realizedPL)}
                          {fmtMoney(match.realizedPL, t.currency)}（{sign(sellPct)}
                          {sellPct.toFixed(1)}%）
                        </div>
                        <div className="text-xs text-faint">≈{fmtMoney(match.realizedPLCNY, 'CNY')}</div>
                      </div>
                    ) : isBuy ? (
                      cur !== undefined ? (
                        <div>
                          <div className="text-xs" style={{ color: colorOf(plOrig) }}>
                            现价盈亏 {sign(plOrig)}
                            {fmtMoney(plOrig, t.currency)}（{sign(plPct)}
                            {plPct.toFixed(1)}%）
                          </div>
                          <div className="text-xs text-faint">
                            ≈{fmtMoney(plOrig * fx, 'CNY')} · 现价 {fmtMoney(cur, t.currency)}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-faint">现价 — 未更新</div>
                      )
                    ) : (
                      <div className="text-xs text-faint">≈{fmtMoney(txnAmount(t) * fx, 'CNY')}</div>
                    )}
                  </div>
                  {t.type === 'sell' && match && (
                    <button
                      className="text-faint text-lg px-1 shrink-0"
                      onClick={() => setExpanded((v) => ({ ...v, [t.id]: !v[t.id] }))}
                      aria-label="展开"
                    >
                      {expandedThis ? '▾' : '▸'}
                    </button>
                  )}
                  <button
                    className="text-faint text-lg px-1 shrink-0"
                    onClick={() => setDelId(t.id)}
                    aria-label="删除"
                  >
                    🗑
                  </button>
                </div>
                {t.type === 'sell' && match && expandedThis && (
                  <div className="mt-2 pt-2 border-t border-soft text-xs text-faint space-y-1">
                    <div>对应买入批次：</div>
                    {match.matched.map((m) => {
                      const ml = (derived.lots[t.security_id] ?? []).find((l) => l.lotId === m.lotId)
                      return (
                        <div key={m.lotId} className="flex justify-between">
                          <span>
                            {m.shares} 股 @ {fmtMoney(m.costPerShare, t.currency)}
                          </span>
                          <span>{ml ? ml.openedAt.slice(0, 10) : ''}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal open={delId !== null} title="删除交易" onClose={() => setDelId(null)}>
        <p className="text-sub mb-4">确定删除该笔交易？此操作不可撤销。</p>
        <div className="flex gap-3">
          <button className="btn-ghost flex-1" onClick={() => setDelId(null)}>
            取消
          </button>
          <button className="btn-danger flex-1" onClick={del}>
            删除
          </button>
        </div>
      </Modal>
    </div>
  )
}

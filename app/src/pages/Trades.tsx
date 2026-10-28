import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import { fmtMoney } from '@/lib/money'
import { deriveLots, investTxnAmount, sharesHeldAt, totalDividend } from '@/lib/calc'
import { fmtDate, nowLocalISO } from '@/lib/date'
import { buildPending, fetchPlansFor } from '@/lib/dividendScan'
import type { InvestTxn, InvestTxnType } from '@/types'
import Modal from '@/components/Modal'
import EmptyState from '@/components/EmptyState'

// 分红由「分红助手」检测入账，记录页只负责展示与删除（新增入口不在这里，避免重复记账）
const TXN_LABEL: Record<InvestTxnType, string> = {
  buy: '买入',
  sell: '卖出',
  dividend: '分红',
  split: '送股/拆股',
}
const TXN_TONE: Record<InvestTxnType, { bg: string; fg: string }> = {
  buy: { bg: 'var(--accent-soft)', fg: 'var(--accent-strong)' },
  sell: { bg: 'var(--card-2)', fg: 'var(--sub)' },
  dividend: { bg: 'var(--card-2)', fg: 'var(--income-text)' },
  split: { bg: 'var(--card-2)', fg: 'var(--sub)' },
}

const FILTERS: { key: InvestTxnType | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'buy', label: '买入' },
  { key: 'sell', label: '卖出' },
  { key: 'dividend', label: '分红' },
  { key: 'split', label: '送股' },
]


// 红涨绿跌（仅投资模块）
function colorOf(v: number): string {
  return v >= 0 ? 'var(--expense-text)' : 'var(--income-text)'
}
function sign(v: number): string {
  return v >= 0 ? '+' : ''
}

// 月份分组：按交易时间倒序，同月连续，直接线性切段
function groupByMonth(list: InvestTxn[]): { ym: string; items: InvestTxn[] }[] {
  const out: { ym: string; items: InvestTxn[] }[] = []
  for (const t of list) {
    const k = t.datetime.slice(0, 7)
    const last = out[out.length - 1]
    if (last && last.ym === k) last.items.push(t)
    else out.push({ ym: k, items: [t] })
  }
  return out
}
const monthTitle = (ym: string) => `${ym.slice(0, 4)}年${Number(ym.slice(5, 7))}月`

export default function Trades() {
  const navigate = useNavigate()
  const securities = useStore((s) => s.securities)
  const investTxns = useStore((s) => s.investTxns)
  const fxRate = useStore((s) => s.settings.fxRate.rate)
  const hkdRate = useStore((s) => s.settings.hkdRate.rate)
  const deleteInvestTxn = useStore((s) => s.deleteInvestTxn)
  const refreshQuotes = useStore((s) => s.refreshQuotes)
  const setDividendScanAt = useStore((s) => s.setDividendScanAt)
  const ignored = useStore((s) => s.settings.dividendIgnored ?? [])
  const costBasis = useStore((s) => s.settings.costBasis ?? 'actual')
  const [filter, setFilter] = useState<InvestTxnType | 'all'>('all')
  const [secFilter, setSecFilter] = useState('all')
  const [delId, setDelId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  const secMap = useMemo(() => new Map(securities.map((s) => [s.id, s])), [securities])
  const derived = useMemo(
    () => deriveLots(securities, investTxns, fxRate, hkdRate),
    [securities, investTxns, fxRate, hkdRate]
  )
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  // 每只证券累计分红到手（原币），用于分红行副标题
  const divTotalBySec = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of securities) m.set(s.id, totalDividend(investTxns, s.id))
    return m
  }, [securities, investTxns])

  // 刷新行情时顺带强制重新检测分红：已入账的会自动去重，不会重复提醒
  const scanDividends = async () => {
    try {
      const heldSecs = securities.filter((s) => sharesHeldAt(s.id, investTxns, Date.now()) > 0)
      if (!heldSecs.length) return
      const plans = await fetchPlansFor(heldSecs, 2, true)
      const pend = buildPending(heldSecs, investTxns, plans, fxRate, hkdRate, ignored)
      setPendingCount(pend.length)
      setDividendScanAt(nowLocalISO())
    } catch {
      /* 检测失败不影响刷新行情 */
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await refreshQuotes(true)
    await scanDividends()
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
  const groups = useMemo(() => groupByMonth(list), [list])

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

      {/* 刷新后发现的待入账分红：只提示，不静默入账 */}
      {pendingCount !== null && pendingCount > 0 && (
        <button
          className="w-full text-left text-sm px-3 py-2.5 rounded-xl"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}
          onClick={() => navigate('/invest/dividends')}
        >
          💰 发现 {pendingCount} 笔分红待入账 · 去确认 →
        </button>
      )}

      {/* 筛选：分红不在此处，统一走分红助手 */}
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
        <div className="card">
          <EmptyState
            icon="📈"
            title="暂无交易记录"
            desc="买入、卖出与分红都会出现在这里"
          />
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.ym} className="space-y-2">
              <div className="flex items-baseline justify-between px-1">
                <span className="text-xs font-medium text-sub">{monthTitle(g.ym)}</span>
                <span className="text-xs text-faint">{g.items.length} 笔</span>
              </div>
              {g.items.map((t) => {
                const sec = secMap.get(t.security_id)
                const isBuy = t.type === 'buy'
                const fx = t.currency === 'USD' ? fxRate : t.currency === 'HKD' ? hkdRate : 1
                const cur = isBuy ? sec?.lastPrice ?? sec?.manualPrice : undefined
                // 该笔买入相对现价的浮动盈亏（原币）
                const plOrig = cur !== undefined ? (cur - t.price) * t.shares - t.fee : 0
                const costOrig = t.price * t.shares + t.fee
                const plPct = costOrig > 0 ? (plOrig / costOrig) * 100 : 0
                const match = t.type === 'sell' ? derived.sells[t.id] : undefined
                const lot = isBuy
                  ? (derived.lots[t.security_id] ?? []).find((l) => l.lotId === t.id)
                  : undefined
                const expandedThis = !!expanded[t.id]
                const sellCost = match
                  ? match.matched.reduce((a, m) => a + m.shares * m.costPerShare, 0)
                  : 0
                const sellPct = sellCost > 0 ? (match!.realizedPL / sellCost) * 100 : 0
                const tone = TXN_TONE[t.type]
                return (
                  <div key={t.id} className="card-2">
                    {/* 第一层：类型 + 证券 + 日期 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0"
                          style={{ color: tone.fg, background: tone.bg }}
                        >
                          {TXN_LABEL[t.type]}
                        </span>
                        <span className="text-main truncate">{sec?.name ?? '已删除证券'}</span>
                        {sec && <span className="text-xs text-faint shrink-0">{sec.code}</span>}
                      </div>
                      <span className="text-xs text-faint shrink-0">{fmtDate(t.datetime)}</span>
                    </div>

                    {/* 第二层：数量 × 价格 → 金额 */}
                    <div className="flex items-baseline justify-between gap-3 mt-1.5">
                      <span className="text-xs text-sub">
                        {t.type === 'split'
                          ? `股数 ${t.shares > 0 ? '+' : ''}${t.shares} · 成本摊薄`
                          : t.type === 'dividend'
                            ? t.shares > 0
                              ? `持股 ${t.shares} 股 × 每股 ${fmtMoney(t.price, t.currency)}`
                              : '分红（按总额）'
                            : `${t.shares} 股 × ${fmtMoney(t.price, t.currency)}`}
                        {t.type !== 'split' && (t.fee ?? 0) !== 0 && (
                          <span className="text-faint">
                            {` ${t.type === 'dividend' ? '税 −' : t.type === 'sell' ? '− 费 ' : '+ 费 '}${fmtMoney(Math.abs(t.fee), t.currency)}`}
                          </span>
                        )}
                      </span>
                      <span
                        className="font-semibold tabular-nums shrink-0"
                        style={t.type === 'dividend' ? { color: 'var(--income-text)' } : undefined}
                      >
                        {t.type === 'split' ? '—' : fmtMoney(investTxnAmount(t), t.currency)}
                      </span>
                    </div>

                    {/* 第三层：盈亏 / 状态 + 操作 */}
                    <div className="flex items-end justify-between gap-2 mt-1.5">
                      <div className="min-w-0 text-xs">
                        {t.type === 'dividend' ? (
                          <span className="text-faint">
                            分红到手 · 该证券累计{' '}
                            {fmtMoney(divTotalBySec.get(t.security_id) ?? 0, t.currency)}
                            {costBasis === 'amortized' ? '（已冲减持仓成本）' : ''}
                          </span>
                        ) : t.type === 'sell' && match ? (
                          <span style={{ color: colorOf(match.realizedPL) }}>
                            已实现 {sign(match.realizedPL)}
                            {fmtMoney(match.realizedPL, t.currency)}（{sign(sellPct)}
                            {sellPct.toFixed(1)}% · ≈{fmtMoney(match.realizedPLCNY, 'CNY')}）
                          </span>
                        ) : isBuy ? (
                          cur !== undefined ? (
                            <span style={{ color: colorOf(plOrig) }}>
                              现价盈亏 {sign(plOrig)}
                              {fmtMoney(plOrig, t.currency)}（{sign(plPct)}
                              {plPct.toFixed(1)}% · ≈{fmtMoney(plOrig * fx, 'CNY')}）
                            </span>
                          ) : (
                            <span className="text-faint">现价未更新</span>
                          )
                        ) : (
                          <span className="text-faint">
                            {lot && lot.remaining <= 0
                              ? '该批次已清仓'
                              : lot
                                ? `持仓中 · 剩 ${lot.remaining} 股`
                                : '—'}
                          </span>
                        )}
                        {isBuy && lot && lot.remaining <= 0 && (
                          <span className="ml-1" style={{ color: colorOf(derived.lotRealized[lot.lotId] ?? 0) }}>
                            共{sign(derived.lotRealized[lot.lotId] ?? 0)}
                            {fmtMoney(derived.lotRealized[lot.lotId] ?? 0, t.currency)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {t.type === 'sell' && match && (
                          <button
                            className="text-faint text-base px-1"
                            onClick={() => setExpanded((v) => ({ ...v, [t.id]: !v[t.id] }))}
                            aria-label="展开批次"
                          >
                            {expandedThis ? '▾' : '▸'}
                          </button>
                        )}
                        <button
                          className="text-faint text-base px-1"
                          onClick={() => setDelId(t.id)}
                          aria-label="删除"
                        >
                          🗑
                        </button>
                      </div>
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
          ))}
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

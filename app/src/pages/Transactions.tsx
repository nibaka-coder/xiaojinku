import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import Modal from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import { Icon, Glyph } from '@/components/Icon'
import { fmtTime, lastNMonths, ym, monthRange, monthsBetween } from '@/lib/date'
import { fmtMoney } from '@/lib/money'
import { isAmortized } from '@/lib/calc'

type TypeFilter = 'all' | 'expense' | 'income'
type SourceFilter = 'all' | 'cash' | 'credit'
type RangeKey = 'month' | '3m' | '6m' | '1y' | 'custom'

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'expense', label: '支出' },
  { key: 'income', label: '收入' },
]
const SOURCE_FILTERS: { key: SourceFilter; label: string }[] = [
  { key: 'all', label: '全部来源' },
  { key: 'cash', label: '现金' },
  { key: 'credit', label: '信用贷款' },
]
// 时间范围常驻一行；「自定义」收进筛选面板，避免首屏堆四行控件
const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'month', label: '本月' },
  { key: '3m', label: '近3月' },
  { key: '6m', label: '近6月' },
  { key: '1y', label: '近1年' },
]

function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(y, m - 1, d).getDay()]
  return `${m}月${d}日 · ${w}`
}

export default function Transactions() {
  const navigate = useNavigate()
  const transactions = useStore((s) => s.transactions)
  const categories = useStore((s) => s.categories)
  const deleteTransaction = useStore((s) => s.deleteTransaction)

  const curYm = ym(new Date())
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [range, setRange] = useState<RangeKey>('month')
  const [showFilters, setShowFilters] = useState(false)
  const [customStart, setCustomStart] = useState(curYm)
  const [customEnd, setCustomEnd] = useState(curYm)
  const [pendingDel, setPendingDel] = useState<{ id: string; label: string } | null>(null)

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (typeFilter !== 'all') n++
    if (sourceFilter !== 'all') n++
    if (range === 'custom') n++
    return n
  }, [typeFilter, sourceFilter, range])

  const { rangeStart, rangeEnd } = useMemo(() => {
    let m: string[]
    if (range === 'month') m = [curYm]
    else if (range === '3m') m = lastNMonths(3)
    else if (range === '6m') m = lastNMonths(6)
    else if (range === '1y') m = lastNMonths(12)
    else m = monthsBetween(customStart, customEnd)
    if (m.length === 0) m = [customStart]
    const { start } = monthRange(m[0])
    const { end } = monthRange(m[m.length - 1])
    return { rangeStart: start, rangeEnd: end }
  }, [range, customStart, customEnd, curYm])

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const list = useMemo(() => {
    let arr = [...transactions]
    if (typeFilter !== 'all') arr = arr.filter((t) => t.type === typeFilter)
    if (sourceFilter !== 'all') arr = arr.filter((t) => t.fund_source === sourceFilter)
    const s = q.trim().toLowerCase()
    if (s) {
      arr = arr.filter(
        (t) =>
          (t.note || '').toLowerCase().includes(s) ||
          (t.payee || '').toLowerCase().includes(s)
      )
    }
    const lo = rangeStart
    const hi = rangeEnd
    arr = arr.filter((t) => {
      const ts = new Date(t.datetime).getTime()
      return ts >= lo && ts <= hi
    })
    arr.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
    return arr
  }, [transactions, typeFilter, sourceFilter, q, rangeStart, rangeEnd])

  const groups = useMemo(() => {
    const m = new Map<string, typeof list>()
    for (const t of list) {
      const d = t.datetime.slice(0, 10)
      if (!m.has(d)) m.set(d, [])
      m.get(d)!.push(t)
    }
    return Array.from(m.entries())
  }, [list])

  // 统计条：只统计筛选结果内的日常交易（投资转账不计入开销）
  const totals = useMemo(() => {
    let expense = 0
    let income = 0
    for (const t of list) {
      if (t.is_investment_transfer) continue
      if (t.type === 'income') income += t.amount
      else expense += t.amount
    }
    return { expense, income }
  }, [list])

  const groupSums = useMemo(() => {
    const m = new Map<string, number>()
    for (const [day, items] of groups) {
      let net = 0
      for (const t of items) {
        if (t.is_investment_transfer) continue
        net += t.type === 'income' ? t.amount : -t.amount
      }
      m.set(day, net)
    }
    return m
  }, [groups])

  return (
    <div className="space-y-3">
      {/* 搜索 + 筛选入口合并为一行 */}
      <div className="filterbar">
        <div className="f-input">
          <Icon name="search" size={16} />
          <input
            placeholder="搜索商户 / 备注"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button
          className="f-btn"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          <Icon name="filter" size={15} />
          筛选
          {activeFilterCount > 0 && <span className="f-count">{activeFilterCount}</span>}
        </button>
      </div>

      {/* 时间范围：常驻一行分段 */}
      <div className="timeseg">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`timeseg-item ${range === r.key ? 'timeseg-item-active' : ''}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* 类型 / 来源 / 自定义时间：按需展开 */}
      {showFilters && (
        <div className="card filter-panel">
          <div className="fp-row">
            <span className="fp-label">类型</span>
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setTypeFilter(f.key)}
                className={`chip ${typeFilter === f.key ? 'chip-active' : ''}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="fp-row">
            <span className="fp-label">来源</span>
            {SOURCE_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setSourceFilter(f.key)}
                className={`chip ${sourceFilter === f.key ? 'chip-active' : ''}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="fp-row">
            <span className="fp-label">时间</span>
            <button
              onClick={() => setRange('custom')}
              className={`chip ${range === 'custom' ? 'chip-active' : ''}`}
            >
              自定义
            </button>
            {range === 'custom' && (
              <div className="flex items-center gap-2 w-full mt-1 text-sm">
                <input
                  type="month"
                  className="input flex-1"
                  value={customStart}
                  max={customEnd}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
                <span className="text-faint">至</span>
                <input
                  type="month"
                  className="input flex-1"
                  value={customEnd}
                  min={customStart}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="statbar">
        <span>{list.length} 笔交易</span>
        <span>
          支出 <b>{fmtMoney(totals.expense, 'CNY')}</b>
          {totals.income > 0 && <> · 收入 <b>{fmtMoney(totals.income, 'CNY')}</b></>}
        </span>
      </div>

      {/* 一张连续列表 + 日期分组小标题，替代每天一张独立卡片 */}
      {groups.length > 0 && (
        <div className="card listcard">
          {groups.map(([day, items]) => {
            const sum = groupSums.get(day) ?? 0
            return (
              <div key={day}>
                <div className="grouphd">
                  <span>{dayLabel(day)}</span>
                  <span className="sum">
                    小计 {sum < 0 ? '−' : sum > 0 ? '+' : ''}{fmtMoney(Math.abs(sum), 'CNY')}
                  </span>
                </div>
                {items.map((t) => {
                  const cat = t.category_id ? catMap.get(t.category_id) : undefined
                  const sign = t.type === 'income' ? '+' : '−'
                  const isXfer = !!t.is_investment_transfer
                  const sourceTag = t.is_repayment
                    ? '信用还款'
                    : isXfer
                    ? '投资转账'
                    : t.fund_source === 'credit'
                    ? '信用'
                    : '现金'
                  const glyph = t.is_repayment
                    ? 'card'
                    : isXfer
                    ? t.type === 'income'
                      ? 'inbox'
                      : 'outbox'
                    : cat?.icon ?? 'wallet'
                  return (
                    <div
                      key={t.id}
                      className="listrow active:bg-card-2"
                      onClick={() => navigate(`/add?edit=${t.id}`)}
                    >
                      <div className="glyph-round">
                        <Glyph value={glyph} size={16} />
                      </div>
                      <div className="lr-mid">
                        <div className="lr-name truncate">
                          {t.note ||
                            cat?.name ||
                            (t.is_repayment
                              ? '信用还款'
                              : isXfer
                              ? t.type === 'income'
                                ? '投资回收'
                                : '投资转出'
                              : t.payee || '交易')}
                        </div>
                        <div className="lr-meta">
                          {fmtTime(t.datetime)} · {sourceTag}
                          {isAmortized(t) && (
                            <span className="ml-1.5" style={{ color: 'var(--accent-strong)' }}>
                              · 摊销{t.amortize_months}期（{t.amortize_start_ym} 起，月摊{' '}
                              {fmtMoney(t.amount / (t.amortize_months || 1), 'CNY')}）
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={`lr-amt ${t.type === 'income' ? 'plus' : ''}`}>
                        {sign} {fmtMoney(t.amount, 'CNY')}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setPendingDel({
                            id: t.id,
                            label:
                              t.note ||
                              cat?.name ||
                              (t.is_repayment ? '信用还款' : t.payee || '交易'),
                          })
                        }}
                        className="p-2 -mr-2 rounded-lg lr-del hover:opacity-100 hover:text-[var(--danger-text)] hover:bg-[var(--card-2)] active:bg-[var(--border)]"
                        aria-label="删除该笔"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {list.length === 0 && (
        <div className="card">
          <EmptyState
            icon="receipt"
            title="没有匹配的交易"
            desc="换个筛选条件或时间范围再看看"
          />
        </div>
      )}

      {pendingDel && (
        <Modal
          title="删除交易"
          onClose={() => setPendingDel(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setPendingDel(null)}>
                取消
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  deleteTransaction(pendingDel.id)
                  setPendingDel(null)
                }}
              >
                删除
              </button>
            </>
          }
        >
          <p className="text-sm text-sub">
            确定删除「{pendingDel.label}」这笔交易吗？删除后不可恢复，对应的余额与统计也会相应回退。
          </p>
        </Modal>
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import Modal from '@/components/Modal'
import { fmtTime } from '@/lib/date'
import { fmtMoney } from '@/lib/money'
import { isAmortized } from '@/lib/calc'
import { lastNMonths, ym, monthRange, monthsBetween } from '@/lib/date'

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
const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'month', label: '本月' },
  { key: '3m', label: '近3月' },
  { key: '6m', label: '近6月' },
  { key: '1y', label: '近1年' },
  { key: 'custom', label: '自定义' },
]

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
  const [customStart, setCustomStart] = useState(curYm)
  const [customEnd, setCustomEnd] = useState(curYm)
  const [pendingDel, setPendingDel] = useState<{ id: string; label: string } | null>(null)

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

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold text-main">流水</h1>

      <input
        className="input"
        placeholder="搜索商户 / 备注"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="flex gap-2 text-sm overflow-x-auto">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`chip whitespace-nowrap ${range === r.key ? 'chip-active' : ''}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {range === 'custom' && (
        <div className="card flex items-center gap-3 text-sm">
          <label className="text-sub shrink-0">起始月</label>
          <input
            type="month"
            className="input flex-1"
            value={customStart}
            max={customEnd}
            onChange={(e) => setCustomStart(e.target.value)}
          />
          <span className="text-faint">至</span>
          <label className="text-sub shrink-0">结束月</label>
          <input
            type="month"
            className="input flex-1"
            value={customEnd}
            min={customStart}
            onChange={(e) => setCustomEnd(e.target.value)}
          />
        </div>
      )}

      <div className="flex gap-2 text-sm overflow-x-auto">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            className={`chip whitespace-nowrap ${typeFilter === f.key ? 'chip-active' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 text-sm overflow-x-auto">
        {SOURCE_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setSourceFilter(f.key)}
            className={`chip whitespace-nowrap ${sourceFilter === f.key ? 'chip-active' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="text-xs text-faint px-1">共 {list.length} 笔</div>

      {groups.map(([day, items]) => (
        <div key={day} className="card p-0 overflow-hidden">
          <div className="px-4 py-2 bg-card-2 text-xs text-sub">{day}</div>
          <div>
            {items.map((t) => {
              const cat = t.category_id ? catMap.get(t.category_id) : undefined
              const sign = t.type === 'income' ? '+' : '−'
              const isXfer = !!t.is_investment_transfer
              const color = t.type === 'income' ? 'var(--income)' : t.is_repayment ? 'var(--credit)' : 'var(--text)'
              const sourceTag = t.is_repayment
                ? { text: '信用还款', c: 'var(--credit)' }
                : isXfer
                ? { text: '投资转账', c: 'var(--accent-strong)' }
                : t.fund_source === 'credit'
                ? { text: '信用', c: 'var(--credit)' }
                : { text: '现金', c: 'var(--text-sub)' }
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between px-4 py-3 border-b border-soft last:border-0 active:bg-card-2"
                  onClick={() => navigate(`/add?edit=${t.id}`)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-lg"
                      style={{ background: isXfer ? 'var(--accent-soft)' : t.is_repayment ? 'var(--credit-soft)' : 'var(--card-2)' }}
                    >
                      {t.is_repayment ? '💳' : isXfer ? (t.type === 'income' ? '📥' : '📤') : cat?.icon ?? '💸'}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-main truncate">
                        {t.note || cat?.name || (t.is_repayment ? '信用还款' : isXfer ? (t.type === 'income' ? '投资回收' : '投资转出') : t.payee || '交易')}
                      </div>
                      <div className="text-xs text-faint">
                        {fmtTime(t.datetime)} · <span style={{ color: sourceTag.c }}>{sourceTag.text}</span>
                        {isAmortized(t) && (
                          <span className="ml-1.5" style={{ color: 'var(--accent-strong)' }}>
                            · 摊销{t.amortize_months}期（{t.amortize_start_ym} 起，月摊{' '}
                            {fmtMoney(t.amount / (t.amortize_months || 1), 'CNY')}）
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="text-sm font-semibold" style={{ color }}>
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
                      className="p-2 -mr-2 rounded-lg text-faint hover:text-[var(--danger)] hover:bg-[var(--card-2)] active:bg-[var(--border)]"
                      aria-label="删除该笔"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {list.length === 0 && <div className="text-center text-faint py-10">没有匹配的交易</div>}

      {pendingDel && (
        <Modal
          title="删除交易"
          onClose={() => setPendingDel(null)}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setPendingDel(null)}>
                取消
              </button>
              <button
                className="btn-primary"
                style={{ background: 'var(--danger)' }}
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

import { useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import { useStore } from '@/store/useStore'
import { trend, categoryBreakdownRange, periodSummary, topExpenses, isAmortized } from '@/lib/calc'
import { lastNMonths, ym, monthRange, monthsBetween, fmtDate } from '@/lib/date'
import { fmtMoney } from '@/lib/money'
import EChart from '@/components/EChart'

const ACCENT = '#5fa896'
const INCOME = '#7cc6a6'
const EXPENSE = '#ec9a8e'

type RangeKey = 'month' | '3m' | '6m' | '1y' | 'custom'

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'month', label: '本月' },
  { key: '3m', label: '近3月' },
  { key: '6m', label: '近6月' },
  { key: '1y', label: '近1年' },
  { key: 'custom', label: '自定义' },
]

export default function Statistics() {
  const transactions = useStore((s) => s.transactions)
  const categories = useStore((s) => s.categories)

  const curYm = ym(new Date())
  const [range, setRange] = useState<RangeKey>('month')
  const [customStart, setCustomStart] = useState(curYm)
  const [customEnd, setCustomEnd] = useState(curYm)

  const { months, rangeStart, rangeEnd } = useMemo(() => {
    let m: string[]
    if (range === 'month') m = [curYm]
    else if (range === '3m') m = lastNMonths(3)
    else if (range === '6m') m = lastNMonths(6)
    else if (range === '1y') m = lastNMonths(12)
    else m = monthsBetween(customStart, customEnd)
    if (m.length === 0) m = [customStart]
    const { start } = monthRange(m[0])
    const { end } = monthRange(m[m.length - 1])
    return { months: m, rangeStart: start, rangeEnd: end }
  }, [range, customStart, customEnd, curYm])

  const crossYear = useMemo(() => new Set(months.map((x) => x.slice(0, 4))).size > 1, [months])
  const labelOf = (ymStr: string) =>
    crossYear ? ymStr.replace('-', '/') : `${Number(ymStr.split('-')[1])}月`

  const period = useMemo(
    () => periodSummary(rangeStart, rangeEnd, transactions),
    [rangeStart, rangeEnd, transactions]
  )
  const slices = useMemo(
    () => categoryBreakdownRange(rangeStart, rangeEnd, transactions, categories),
    [rangeStart, rangeEnd, transactions, categories]
  )
  const trendData = useMemo(() => trend(months, transactions), [months, transactions])
  const topList = useMemo(
    () => topExpenses(rangeStart, rangeEnd, transactions, 10),
    [rangeStart, rangeEnd, transactions]
  )

  const periodLabel = range === 'month' ? '本月' : range === 'custom' ? '区间' : `近${months.length}月`

  const trendOption = useMemo<EChartsOption>(
    () => ({
      color: [INCOME, EXPENSE, ACCENT],
      tooltip: { trigger: 'axis' },
      legend: { data: ['收入', '支出', '净额'], bottom: 0, textStyle: { color: '#7c7884' } },
      grid: { left: 8, right: 8, top: 16, bottom: 36, containLabel: true },
      xAxis: {
        type: 'category',
        data: trendData.map((t) => labelOf(t.ym)),
        axisLine: { lineStyle: { color: '#cfccd6' } },
        axisLabel: { color: '#7c7884' },
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: (v: number) => `${v / 1000}k`, color: '#7c7884' },
        splitLine: { lineStyle: { color: 'rgba(46,44,51,0.06)' } },
      },
      series: [
        { name: '收入', type: 'line', smooth: true, data: trendData.map((t) => Math.round(t.income)) },
        { name: '支出', type: 'line', smooth: true, data: trendData.map((t) => Math.round(t.expense)) },
        { name: '净额', type: 'bar', data: trendData.map((t) => Math.round(t.net)), barWidth: '40%' },
      ],
    }),
    [trendData, crossYear]
  )

  const pieOption = useMemo<EChartsOption>(() => {
    const data = slices.map((s) => ({
      name: s.category.name,
      value: Math.round(s.amount),
      itemStyle: { color: s.category.color },
    }))
    return {
      tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
      legend: { type: 'scroll', bottom: 0, textStyle: { color: '#7c7884' } },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '44%'],
          data: data.length ? data : [{ name: '暂无支出', value: 1, itemStyle: { color: '#e7e4ee' } }],
          label: { formatter: '{b}\n{d}%', color: '#2e2c33' },
        },
      ],
    }
  }, [slices])

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-main">统计</h1>

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
          <label className="text-sub">起始月</label>
          <input
            type="month"
            className="input flex-1"
            value={customStart}
            max={customEnd}
            onChange={(e) => setCustomStart(e.target.value)}
          />
          <span className="text-faint">至</span>
          <label className="text-sub">结束月</label>
          <input
            type="month"
            className="input flex-1"
            value={customEnd}
            min={customStart}
            onChange={(e) => setCustomEnd(e.target.value)}
          />
        </div>
      )}

      <section className="card grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xs text-faint">{periodLabel}收入</div>
          <div className="font-semibold" style={{ color: 'var(--income-text)' }}>{fmtMoney(period.income, 'CNY')}</div>
        </div>
        <div>
          <div className="text-xs text-faint">{periodLabel}支出</div>
          <div className="font-semibold" style={{ color: 'var(--expense-text)' }}>{fmtMoney(period.expense, 'CNY')}</div>
        </div>
        <div>
          <div className="text-xs text-faint">净额</div>
          <div className="font-semibold" style={{ color: period.net >= 0 ? 'var(--accent)' : 'var(--danger-text)' }}>
            {fmtMoney(period.net, 'CNY', { sign: true })}
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="font-medium text-main mb-2">
          {months.length > 1 ? `${periodLabel}收支趋势` : '收支趋势'}
        </h2>
        {months.length > 1 ? (
          <EChart option={trendOption} />
        ) : (
          <div className="text-center text-faint py-10">选择更长时间区间（近3月及以上）查看收支趋势</div>
        )}
      </section>

      <section className="card">
        <h2 className="font-medium text-main mb-2">{periodLabel}支出分类占比</h2>
        <EChart option={pieOption} />
      </section>

      {/* 支出排行：单笔流水 TOP10（不按分类） */}
      <section className="card">
        <h2 className="font-medium text-main mb-2">{periodLabel}支出排行 TOP10</h2>
        {topList.length === 0 ? (
          <div className="text-center text-faint py-8">该区间暂无支出记录</div>
        ) : (
          <div className="space-y-1">
            {topList.map((t, i) => {
              const cat = t.category_id ? categories.find((c) => c.id === t.category_id) : undefined
              const isAm = isAmortized(t)
              return (
                <div key={t.id} className="flex items-center gap-3 py-1.5">
                  <span
                    className="w-5 text-center text-xs font-semibold shrink-0"
                    style={{ color: i < 3 ? 'var(--expense-text)' : 'var(--text-faint)' }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-base shrink-0">{cat?.icon ?? '💸'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-main truncate">
                      {t.note || t.payee || cat?.name || '交易'}
                    </div>
                    <div className="text-xs text-faint">
                      {fmtDate(t.datetime)}
                      {isAm && ` · 摊销${t.amortize_months}期`}
                    </div>
                  </div>
                  <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--expense-text)' }}>
                    {fmtMoney(t.amount, 'CNY')}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        {topList.some((t) => isAmortized(t)) && (
          <p className="text-xs text-faint mt-2">
            标注「摊销」的支出在上方占比与趋势中按月分摊计入，此处显示的是实际支付金额。
          </p>
        )}
      </section>

    </div>
  )
}

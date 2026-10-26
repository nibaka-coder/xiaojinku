import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import * as echarts from 'echarts'
import { useStore } from '@/store/useStore'
import {
  cashBalance,
  creditLiability,
  liabilitiesTotal,
  netWorth,
  netWorthTrend,
  investCashBalance,
  monthlySummary,
  periodSummary,
  investSummary,
  investYtdInvested,
  isAmortized,
  amortizedExpenseInMonth,
} from '@/lib/calc'
import { ym, monthRange, lastNMonths } from '@/lib/date'
import { fmtMoney } from '@/lib/money'
import EChart from '@/components/EChart'
import type { Security, InvestTxn } from '@/types'

// 环比变化率（prev 为 0 时无法比较，返回 null）
function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return null
  return ((cur - prev) / Math.abs(prev)) * 100
}

// 箭头 + 颜色：expense 下降为优(green)，income 上升为优(green)
function deltaBadge(cur: number, prev: number, kind: 'expense' | 'income') {
  const pct = pctChange(cur, prev)
  if (pct === null) return { text: '—', color: 'var(--faint)' }
  const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '—'
  const good = kind === 'expense' ? pct < 0 : pct > 0
  const color = pct === 0 ? 'var(--faint)' : good ? 'var(--income)' : 'var(--expense)'
  return { text: `${arrow}${Math.round(Math.abs(pct))}%`, color }
}

export default function Overview() {
  const navigate = useNavigate()
  const transactions = useStore((s) => s.transactions)
  const liabilities = useStore((s) => s.liabilities)
  const cashOpening = useStore((s) => s.settings.cashOpening)
  const securities = useStore((s) => s.securities)
  const investTxns = useStore((s) => s.investTxns)
  const fxRate = useStore((s) => s.settings.fxRate.rate)
  const hkdRate = useStore((s) => s.settings.hkdRate.rate)
  const costBasis = useStore((s) => s.settings.costBasis ?? 'actual')
  const investCashOpening = useStore((s) => s.settings.investCashOpening ?? 0)

  const curYm = ym(new Date())
  const credit = useMemo(() => creditLiability(transactions), [transactions])
  const liab = useMemo(() => liabilitiesTotal(liabilities, transactions), [liabilities, transactions])
  const nw = useMemo(
    () =>
      netWorth(
        transactions,
        liabilities,
        cashOpening,
        securities,
        investTxns,
        fxRate,
        hkdRate,
        investCashOpening
      ),
    [transactions, liabilities, cashOpening, securities, investTxns, fxRate, hkdRate, investCashOpening]
  )
  const cash = useMemo(() => cashBalance(transactions, cashOpening), [transactions, cashOpening])
  // 券商账户现金（含未回收的分红）：不计入的话，除权后净资产会凭空少一笔
  const investCash = useMemo(
    () => investCashBalance(transactions, investTxns, fxRate, hkdRate, Infinity, investCashOpening),
    [transactions, investTxns, fxRate, hkdRate, investCashOpening]
  )
  const investM = useMemo(
    () => investSummary(securities, investTxns, fxRate, hkdRate, costBasis).marketCNY,
    [securities, investTxns, fxRate, hkdRate, costBasis]
  )
  const ms = useMemo(() => monthlySummary(curYm, transactions), [curYm, transactions])

  // 环比：上月
  const lastYm = useMemo(() => {
    const d = new Date()
    return ym(new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }, [])
  const lastMs = useMemo(() => monthlySummary(lastYm, transactions), [lastYm, transactions])

  // 本年累计：今年1月1日 ~ 当前月月底
  const ytd = useMemo(() => {
    const d = new Date()
    const yearStart = new Date(d.getFullYear(), 0, 1).getTime()
    const { end } = monthRange(curYm)
    return periodSummary(yearStart, end, transactions)
  }, [curYm, transactions])

  const expDelta = deltaBadge(ms.expense, lastMs.expense, 'expense')
  const incDelta = deltaBadge(ms.income, lastMs.income, 'income')

  // 本月是否含摊销分摊（用于标注口径，避免一次性支出被误读）
  const hasAmort = useMemo(
    () => transactions.some((t) => isAmortized(t) && amortizedExpenseInMonth(t, curYm) > 0),
    [transactions, curYm]
  )

  // 净资产走势（近一年，固定区间）
  const nwMonths = useMemo(() => lastNMonths(12), [])
  const nwTrend = useMemo(
    () =>
      netWorthTrend(
        nwMonths,
        transactions,
        liabilities,
        cashOpening,
        securities,
        investTxns,
        fxRate,
        hkdRate,
        investCashOpening
      ),
    [
      nwMonths,
      transactions,
      liabilities,
      cashOpening,
      securities,
      investTxns,
      fxRate,
      hkdRate,
      investCashOpening,
    ]
  )
  const nwYearDelta = useMemo(() => {
    if (nwTrend.length < 2) return 0
    return nwTrend[nwTrend.length - 1].net - nwTrend[0].net
  }, [nwTrend])

  const nwOption = useMemo<echarts.EChartsOption>(() => {
    const up = nwYearDelta >= 0
    const line = up ? '#5fa896' : '#e5736b'
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params
          const d = nwTrend[p.dataIndex as number]
          if (!d) return ''
          return [
            d.ym,
            `净资产 ${fmtMoney(d.net, 'CNY')}`,
            `现金 ${fmtMoney(d.cash, 'CNY')} · 投资 ${fmtMoney(d.invest, 'CNY')} · 负债 ${fmtMoney(d.debt, 'CNY')}`,
          ].join('<br/>')
        },
      },
      grid: { left: 8, right: 8, top: 12, bottom: 20, containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        // 1 月标注年份，其余只显示月份，跨年也一眼能看懂
        data: nwTrend.map((d) => {
          const m = d.ym.split('-')[1]
          return m === '01' ? `${d.ym.slice(2, 4)}/1` : String(Number(m))
        }),
        axisLine: { lineStyle: { color: '#cfccd6' } },
        axisLabel: { color: '#7c7884', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: (v: number) => `${Math.round(v / 10000)}万`, color: '#7c7884', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(46,44,51,0.06)' } },
      },
      series: [
        {
          name: '净资产',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: nwTrend.map((d) => Math.round(d.net)),
          lineStyle: { width: 2.5, color: line },
          itemStyle: { color: line },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: up ? 'rgba(95,168,150,0.26)' : 'rgba(229,115,107,0.26)' },
                { offset: 1, color: 'rgba(95,168,150,0.02)' },
              ],
            },
          },
        },
      ],
    }
  }, [nwTrend, nwYearDelta])

  return (
    <div className="space-y-4">
      <section
        className="card border-0 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)' }}
      >
        <div className="text-sm opacity-85">净资产（{curYm.replace('-', '年')}月）</div>
        <div className="text-2xl sm:text-3xl font-semibold mt-1 tracking-tight tabular-nums">
          {fmtMoney(nw, 'CNY')}
        </div>
        {/* 手机 2 列（标签左 · 金额右），≥sm 恢复五列；五项相加 = 净资产 */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 mt-5 text-sm sm:grid-cols-5 sm:gap-2">
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <div className="opacity-80">现金</div>
            <div className="font-semibold tabular-nums sm:mt-0.5">{fmtMoney(cash, 'CNY', { compact: true })}</div>
          </div>
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <div className="opacity-80">券商现金</div>
            <div className="font-semibold tabular-nums sm:mt-0.5">{fmtMoney(investCash, 'CNY', { compact: true })}</div>
          </div>
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <div className="opacity-80">投资市值</div>
            <div className="font-semibold tabular-nums sm:mt-0.5">{fmtMoney(investM, 'CNY', { compact: true })}</div>
          </div>
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <div className="opacity-80">信用负债</div>
            <div className="font-semibold tabular-nums sm:mt-0.5">{fmtMoney(credit, 'CNY', { compact: true })}</div>
          </div>
          {/* 手机端第五项占满整行，避免末尾留空格 */}
          <div className="flex items-baseline justify-between gap-2 sm:block col-span-2 sm:col-span-1">
            <div className="opacity-80">长期负债</div>
            <div className="font-semibold tabular-nums sm:mt-0.5">{fmtMoney(liab, 'CNY', { compact: true })}</div>
          </div>
        </div>
      </section>

      {/* 净资产走势（近一年） */}
      <section className="card">
        <div className="flex items-baseline justify-between mb-1">
          <span className="font-semibold text-main">净资产走势 · 近一年</span>
          <span
            className="text-sm font-semibold"
            style={{ color: nwYearDelta >= 0 ? 'var(--accent)' : 'var(--danger)' }}
          >
            {nwYearDelta >= 0 ? '+' : '−'}
            {fmtMoney(Math.abs(nwYearDelta), 'CNY')}
          </span>
        </div>
        <EChart option={nwOption} height={180} />
        <p className="text-xs text-faint mt-1">
          现金与负债按交易台账精确推导至各月末；投资部分为「当月持股 × 当前价」的估算值。
        </p>
      </section>

      {/* 日常开销概览 */}
      <section className="card">
        <div className="flex justify-between items-center mb-3">
          <span className="font-semibold text-main">日常开销概览</span>
          <button className="text-sm" style={{ color: 'var(--accent-strong)' }} onClick={() => navigate('/statistics')}>
            统计
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          <div>
            <div className="text-xs text-faint">本月收入</div>
            <div className="font-semibold tabular-nums" style={{ color: 'var(--income)' }}>
              {fmtMoney(ms.income, 'CNY', { compact: true })}
            </div>
          </div>
          <div>
            <div className="text-xs text-faint">本月支出{hasAmort ? '（摊销口径）' : ''}</div>
            <div className="font-semibold tabular-nums" style={{ color: 'var(--expense)' }}>
              {fmtMoney(ms.expense, 'CNY', { compact: true })}
            </div>
          </div>
          <div>
            <div className="text-xs text-faint">净额</div>
            <div className="font-semibold tabular-nums" style={{ color: ms.net >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
              {fmtMoney(ms.net, 'CNY', { sign: true, compact: true })}
            </div>
          </div>
        </div>

        {/* 环比：较上月 */}
        <div className="flex items-center justify-center gap-4 text-xs mb-3">
          <span className="text-faint">较上月</span>
          <span className="text-sub">
            支出 <span className="font-semibold" style={{ color: expDelta.color }}>{expDelta.text}</span>
          </span>
          <span className="text-sub">
            收入 <span className="font-semibold" style={{ color: incDelta.color }}>{incDelta.text}</span>
          </span>
        </div>

        {/* 本年累计副行 */}
        <div className="flex justify-between items-center pt-2.5 border-t border-card-2 text-sm">
          <span className="text-faint">本年累计</span>
          <span className="text-sub">
            支出 {fmtMoney(ytd.expense, 'CNY')}
            <span className="text-faint mx-1.5">·</span>
            结余 <span className="font-semibold" style={{ color: ytd.net >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{fmtMoney(ytd.net, 'CNY', { sign: true })}</span>
          </span>
        </div>
      </section>

      {/* 投资情况概览 */}
      <InvestOverviewCard
        securities={securities}
        investTxns={investTxns}
        fxRate={fxRate}
        hkdRate={hkdRate}
        onOpen={() => navigate('/invest/holdings')}
        onAdd={() => navigate('/invest/add')}
      />

    </div>
  )
}

// 投资情况概览卡片（红涨绿跌）
function InvestOverviewCard({
  securities,
  investTxns,
  fxRate,
  hkdRate,
  onOpen,
  onAdd,
}: {
  securities: Security[]
  investTxns: InvestTxn[]
  fxRate: number
  hkdRate: number
  onOpen: () => void
  onAdd: () => void
}) {
  const invest = useMemo(
    () => investSummary(securities, investTxns, fxRate, hkdRate),
    [securities, investTxns, fxRate, hkdRate]
  )
  const ytdInvest = useMemo(
    () => investYtdInvested(investTxns, fxRate, hkdRate),
    [investTxns, fxRate, hkdRate]
  )
  const colorOf = (v: number) => (v >= 0 ? 'var(--expense)' : 'var(--income)')
  const sign = (v: number) => (v >= 0 ? '+' : '')

  return (
    <section className="card">
      <div className="flex justify-between items-center mb-2">
        <span className="font-semibold text-main">投资情况概览</span>
        <button className="text-sm" style={{ color: 'var(--accent-strong)' }} onClick={onOpen}>
          持仓
        </button>
      </div>
      {invest.count === 0 ? (
        <div className="text-center py-6">
          <p className="text-sub">还没有持仓</p>
          <button className="btn-ghost mt-2" onClick={onAdd}>
            去添加证券
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-faint">持仓市值</span>
            <span className="font-semibold">{fmtMoney(invest.marketCNY, 'CNY')}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-faint">累计盈亏</span>
            <span className="font-semibold" style={{ color: colorOf(invest.profitCNY) }}>
              {sign(invest.profitCNY)}
              {fmtMoney(invest.profitCNY, 'CNY')}（{sign(invest.profitPct)}
              {Math.round(invest.profitPct)}%）
            </span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-card-2">
            <span className="text-faint">本年投入</span>
            <span className="text-sub">{fmtMoney(ytdInvest, 'CNY', { sign: true })}</span>
          </div>
        </div>
      )}
    </section>
  )
}

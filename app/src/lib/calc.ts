import type { Liability, Transaction, Category, Security, InvestTxn } from '@/types'
import { monthRange, monthDiff, monthsInRange } from '@/lib/date'

// 以下函数均可传入 endTs 计算「截至某时点」的余额（用于净资产走势）；默认取全部交易
// 现金余额 = 期初现金 + 收入 − 现金支出 − 信用还款
export function cashBalance(txns: Transaction[], cashOpening: number, endTs = Infinity): number {
  let inc = 0
  let cashExp = 0
  let repay = 0
  for (const t of txns) {
    if (endTs !== Infinity && new Date(t.datetime).getTime() > endTs) continue
    if (t.type === 'income') inc += t.amount
    else if (t.is_repayment) repay += t.amount
    else if (t.fund_source === 'cash') cashExp += t.amount
  }
  return cashOpening + inc - cashExp - repay
}

// 信用贷款负债（单一资金池）= 信用消费 − 指向信用池的已还款
export function creditLiability(txns: Transaction[], endTs = Infinity): number {
  let creditExp = 0
  let repay = 0
  for (const t of txns) {
    if (endTs !== Infinity && new Date(t.datetime).getTime() > endTs) continue
    if (t.is_repayment) {
      // 指向信用池（或旧数据未标注）的还款，冲减信用负债
      if (t.liability_id === undefined || t.liability_id === 'credit_pool') repay += t.amount
    } else if (t.type === 'expense' && t.fund_source === 'credit') {
      creditExp += t.amount
    }
  }
  return Math.max(0, creditExp - repay)
}

// 单个负债的当前待还：信用池由交易推导，贷款 = 本金 − 已还
export function liabilityCurrentBalance(l: Liability, txns: Transaction[], endTs = Infinity): number {
  if (l.kind === 'credit') return creditLiability(txns, endTs)
  // 该负债尚未创建时，不参与历史时点的负债计算
  if (endTs !== Infinity && l.created_at && new Date(l.created_at).getTime() > endTs) return 0
  let repaid = 0
  for (const t of txns) {
    if (t.is_repayment && t.liability_id === l.id) {
      if (endTs !== Infinity && new Date(t.datetime).getTime() > endTs) continue
      repaid += t.amount
    }
  }
  return Math.max(0, l.balance - repaid)
}

// 长期负债（车贷/房贷等）当前待还合计
export function liabilitiesTotal(liabilities: Liability[], txns: Transaction[], endTs = Infinity): number {
  return liabilities
    .filter((l) => l.kind !== 'credit')
    .reduce((s, l) => s + liabilityCurrentBalance(l, txns, endTs), 0)
}

// 净资产 = 现金余额 − 信用贷款负债 − 长期负债(车贷等) + 投资市值
export function netWorth(
  txns: Transaction[],
  liabilities: Liability[],
  cashOpening: number,
  securities: Security[] = [],
  investTxns: InvestTxn[] = [],
  fxRate: number = 7.1,
  hkdRate: number = 0.915
): number {
  return (
    cashBalance(txns, cashOpening) -
    creditLiability(txns) -
    liabilitiesTotal(liabilities, txns) +
    investSummary(securities, investTxns, fxRate, hkdRate).marketCNY
  )
}

// ===== 投资管理 =====

export interface Holding {
  security: Security
  shares: number // 当前股数
  avgCost: number // 原币 平均成本
  costOrig: number // 原币 累计成本（含费用）
  currentPrice: number // 原币 现价
  marketValueCNY: number // 市值（折 CNY）
  costCNY: number // 成本（折 CNY）
  profitCNY: number // 浮动盈亏（折 CNY）
  profitPct: number // 盈亏率 %
  dividendCNY: number // 累计分红（折 CNY）
}

function currentPriceOf(s: Security): number {
  return s.lastPrice ?? s.manualPrice ?? 0
}

// 由投资交易台账推导单只证券持仓（不存库，实时推导）
export function deriveHolding(
  s: Security,
  txns: InvestTxn[],
  fxRate: number,
  hkdRate: number = 0.915
): Holding {
  let shares = 0
  let costOrig = 0
  let dividendOrig = 0
  for (const t of txns) {
    if (t.security_id !== s.id) continue
    if (t.type === 'buy') {
      shares += t.shares
      costOrig += t.shares * t.price + t.fee
    } else if (t.type === 'sell') {
      const avg = shares > 0 ? costOrig / shares : 0
      shares -= t.shares
      costOrig -= t.shares * avg
    } else if (t.type === 'dividend') {
      const amt = t.shares > 0 ? t.shares * t.price : t.price
      dividendOrig += amt + t.fee
    }
  }
  if (costOrig < 0) costOrig = 0
  if (shares < 0) shares = 0
  const avgCost = shares > 0 ? costOrig / shares : 0
  const cur = currentPriceOf(s)
  const fx = s.currency === 'USD' ? fxRate : s.currency === 'HKD' ? hkdRate : 1
  const marketValueCNY = shares * cur * fx
  const costCNY = costOrig * fx
  const profitCNY = marketValueCNY - costCNY
  const profitPct = costCNY > 0 ? (profitCNY / costCNY) * 100 : 0
  const dividendCNY = dividendOrig * fx
  return {
    security: s,
    shares,
    avgCost,
    costOrig,
    currentPrice: cur,
    marketValueCNY,
    costCNY,
    profitCNY,
    profitPct,
    dividendCNY,
  }
}

// ===== 买卖批次配对（手动指定 + FIFO 兜底） =====
export interface LotInfo {
  lotId: string // 对应买入交易 id
  securityId: string
  shares: number // 原始买入股数
  costPerShare: number // 每股含费成本（原币）
  openedAt: string
  remaining: number // 剩余可卖股数
}
export interface SellMatchLot {
  lotId: string
  shares: number
  costPerShare: number
}
export interface SellMatch {
  sellId: string
  securityId: string
  realizedPL: number // 已实现盈亏（原币）
  realizedPLCNY: number // 已实现盈亏（折 CNY）
  matched: SellMatchLot[]
}
export interface DerivedLots {
  lots: Record<string, LotInfo[]> // 按 securityId
  sells: Record<string, SellMatch> // 按 sellId
  lotRealized: Record<string, number> // 每批已实现盈亏（原币）
  realizedBySecurity: Record<string, number> // 每证券累计已实现（CNY）
  totalRealizedCNY: number
}

// 由投资交易台账推导买入批与每笔卖出的已实现盈亏。
// 卖出优先使用 t.matchedLots 手动配对；缺失或非法时回退 FIFO（按时间最早批先卖）。
export function deriveLots(
  securities: Security[],
  investTxns: InvestTxn[],
  fxRate: number,
  hkdRate: number = 0.915
): DerivedLots {
  const lotsBySec: Record<string, LotInfo[]> = {}
  const lotRealizedOrig: Record<string, number> = {}
  const sells: Record<string, SellMatch> = {}
  const realizedBySecCNY: Record<string, number> = {}

  for (const s of securities) {
    const txns = investTxns
      .filter((t) => t.security_id === s.id)
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
    const fx = s.currency === 'USD' ? fxRate : s.currency === 'HKD' ? hkdRate : 1
    const lots: LotInfo[] = []
    for (const t of txns) {
      if (t.type === 'buy') {
        const cost = t.shares > 0 ? (t.shares * t.price + t.fee) / t.shares : t.price
        lots.push({
          lotId: t.id,
          securityId: s.id,
          shares: t.shares,
          costPerShare: cost,
          openedAt: t.datetime,
          remaining: t.shares,
        })
      } else if (t.type === 'sell') {
        // 1) 计划：优先用手动 matchedLots
        let plan: { lotIndex: number; shares: number }[] = []
        if (t.matchedLots && t.matchedLots.length) {
          for (const ml of t.matchedLots) {
            const idx = lots.findIndex((l) => l.lotId === ml.lotId)
            if (idx >= 0 && ml.shares > 0) {
              plan.push({ lotIndex: idx, shares: Math.min(ml.shares, lots[idx].remaining) })
            }
          }
        }
        const planShares = plan.reduce((a, b) => a + b.shares, 0)
        // 2) 兜底：手动为空或数量不匹配 → FIFO 填满卖出股数
        if (planShares <= 0 || planShares > t.shares) {
          plan = []
          let need = t.shares
          for (let i = 0; i < lots.length && need > 0; i++) {
            const take = Math.min(lots[i].remaining, need)
            if (take > 0) {
              plan.push({ lotIndex: i, shares: take })
              need -= take
            }
          }
        }
        // 3) 计算已实现盈亏
        let realizedOrig = 0
        const matchedShares = plan.reduce((a, b) => a + b.shares, 0)
        const matched: SellMatchLot[] = []
        for (const p of plan) {
          const lot = lots[p.lotIndex]
          const allocFee = matchedShares > 0 ? t.fee * (p.shares / matchedShares) : 0
          const pl = (t.price - lot.costPerShare) * p.shares - allocFee
          realizedOrig += pl
          lot.remaining -= p.shares
          matched.push({ lotId: lot.lotId, shares: p.shares, costPerShare: lot.costPerShare })
          lotRealizedOrig[lot.lotId] = (lotRealizedOrig[lot.lotId] ?? 0) + pl
        }
        sells[t.id] = {
          sellId: t.id,
          securityId: s.id,
          realizedPL: realizedOrig,
          realizedPLCNY: realizedOrig * fx,
          matched,
        }
        realizedBySecCNY[s.id] = (realizedBySecCNY[s.id] ?? 0) + realizedOrig * fx
      }
    }
    lotsBySec[s.id] = lots
  }

  const totalRealizedCNY = Object.values(realizedBySecCNY).reduce((a, b) => a + b, 0)
  return { lots: lotsBySec, sells, lotRealized: lotRealizedOrig, realizedBySecurity: realizedBySecCNY, totalRealizedCNY }
}

export interface InvestSummary {
  marketCNY: number
  costCNY: number
  profitCNY: number
  profitPct: number
  dividendCNY: number
  count: number // 有持仓(或曾有成本)的证券数
}

// 全部证券的投资汇总（折 CNY）
export function investSummary(
  securities: Security[],
  investTxns: InvestTxn[],
  fxRate: number,
  hkdRate: number = 0.915
): InvestSummary {
  let m = 0
  let c = 0
  let d = 0
  let count = 0
  for (const s of securities) {
    const h = deriveHolding(s, investTxns, fxRate, hkdRate)
    if (h.shares <= 0 && h.costCNY <= 0) continue
    m += h.marketValueCNY
    c += h.costCNY
    d += h.dividendCNY
    count++
  }
  const profitCNY = m - c
  const profitPct = c > 0 ? (profitCNY / c) * 100 : 0
  return { marketCNY: m, costCNY: c, profitCNY, profitPct, dividendCNY: d, count }
}

// 本年净投入（建仓/买入 − 卖出，折 CNY）：用于概览"本年投入"副行
export function investYtdInvested(
  investTxns: InvestTxn[],
  fxRate: number,
  hkdRate: number = 0.915,
  year: number = new Date().getFullYear()
): number {
  let invested = 0
  for (const t of investTxns) {
    if (new Date(t.datetime).getFullYear() !== year) continue
    const fx = t.currency === 'USD' ? fxRate : t.currency === 'HKD' ? hkdRate : 1
    if (t.type === 'buy') invested += (t.shares * t.price + t.fee) * fx
    else if (t.type === 'sell') invested -= t.shares * t.price * fx
  }
  return invested
}

export interface MonthlySummary {
  income: number
  expense: number
  net: number
}

// ===== 摊销口径 =====
// 一笔支出在某自然月应计入多少成本：
// - 未标记摊销：发生当月计入全额（原行为）
// - 标记摊销：从起摊月起按月均摊，末月承担尾差以保证总额精确
export function amortizedExpenseInMonth(t: Transaction, ymStr: string): number {
  const months = t.amortize_months
  const startYm = t.amortize_start_ym
  if (!months || months <= 0 || !startYm || !t.amount) {
    return t.datetime.slice(0, 7) === ymStr ? t.amount : 0
  }
  const idx = monthDiff(startYm, ymStr)
  if (idx < 0 || idx >= months) return 0
  const per = t.amount / months
  // 末月承担尾差：总额 - 前 (months-1) 个月已摊
  return idx === months - 1 ? t.amount - per * (months - 1) : per
}

// 该笔支出是否为摊销类（用于 UI 标记）
export function isAmortized(t: Transaction): boolean {
  return !!t.amortize_months && t.amortize_months > 0 && !!t.amortize_start_ym
}

// 任意区间收支汇总：支出按摊销口径（不含信用还款、投资转账）
export function periodSummary(start: number, end: number, txns: Transaction[]): MonthlySummary {
  let income = 0
  let expense = 0
  for (const t of txns) {
    const ts = new Date(t.datetime).getTime()
    if (t.type === 'income') {
      if (!t.is_investment_transfer && ts >= start && ts <= end) income += t.amount
      continue
    }
    if (t.is_repayment || t.is_investment_transfer) continue
    // 摊销类支出：按区间内各月分摊额累加
    if (isAmortized(t)) {
      for (const m of monthsInRange(start, end)) expense += amortizedExpenseInMonth(t, m)
    } else if (ts >= start && ts <= end) {
      expense += t.amount
    }
  }
  return { income, expense, net: income - expense }
}

// 本月收支：支出按摊销口径（不含信用还款、投资转账）
export function monthlySummary(ymStr: string, txns: Transaction[]): MonthlySummary {
  const { start, end } = monthRange(ymStr)
  let income = 0
  let expense = 0
  for (const t of txns) {
    const ts = new Date(t.datetime).getTime()
    if (t.type === 'income') {
      if (!t.is_investment_transfer && ts >= start && ts <= end) income += t.amount
      continue
    }
    if (t.is_repayment || t.is_investment_transfer) continue
    expense += amortizedExpenseInMonth(t, ymStr)
  }
  return { income, expense, net: income - expense }
}

export interface CategorySlice {
  category: Category
  amount: number
}

export function categoryBreakdown(
  ymStr: string,
  txns: Transaction[],
  categories: Category[]
): CategorySlice[] {
  const map = new Map<string, number>()
  for (const t of txns) {
    if (t.type !== 'expense' || t.is_repayment || t.is_investment_transfer) continue
    const amt = amortizedExpenseInMonth(t, ymStr)
    if (!amt) continue
    const cid = t.category_id ?? 'unknown'
    map.set(cid, (map.get(cid) ?? 0) + amt)
  }
  const catMap = new Map(categories.map((c) => [c.id, c]))
  const slices: CategorySlice[] = []
  for (const [cid, amount] of map) {
    const category = catMap.get(cid) ?? {
      id: cid,
      name: '未分类',
      type: 'expense' as const,
      icon: '❓',
      color: '#9aa0b0',
      is_system: false,
      order: 999,
    }
    slices.push({ category, amount })
  }
  return slices.sort((a, b) => b.amount - a.amount)
}

// 任意区间支出分类占比
export function categoryBreakdownRange(
  start: number,
  end: number,
  txns: Transaction[],
  categories: Category[]
): CategorySlice[] {
  const map = new Map<string, number>()
  const covered = monthsInRange(start, end)
  for (const t of txns) {
    if (t.type !== 'expense' || t.is_repayment || t.is_investment_transfer) continue
    const amt = isAmortized(t)
      ? covered.reduce((s, m) => s + amortizedExpenseInMonth(t, m), 0)
      : (() => {
          const ts = new Date(t.datetime).getTime()
          return ts >= start && ts <= end ? t.amount : 0
        })()
    if (!amt) continue
    const cid = t.category_id ?? 'unknown'
    map.set(cid, (map.get(cid) ?? 0) + amt)
  }
  const catMap = new Map(categories.map((c) => [c.id, c]))
  const slices: CategorySlice[] = []
  for (const [cid, amount] of map) {
    const category = catMap.get(cid) ?? {
      id: cid,
      name: '未分类',
      type: 'expense' as const,
      icon: '❓',
      color: '#9aa0b0',
      is_system: false,
      order: 999,
    }
    slices.push({ category, amount })
  }
  return slices.sort((a, b) => b.amount - a.amount)
}

export interface TrendPoint {
  ym: string
  income: number
  expense: number
  net: number
}

export function trend(months: string[], txns: Transaction[]): TrendPoint[] {
  return months.map((m) => ({ ym: m, ...monthlySummary(m, txns) }))
}

// ===== 净资产走势 =====
// 每个自然月月末的净资产 = 现金 + 投资市值 − 负债
// 现金/负债由交易台账精确推导到月末；投资部分按当时持股数 × 当前价估算
// （历史逐月行情不留存，故为近似值，UI 上会标注说明）
export interface NetWorthPoint {
  ym: string
  net: number
  cash: number
  invest: number
  debt: number
}

export function netWorthTrend(
  months: string[],
  txns: Transaction[],
  liabilities: Liability[],
  cashOpening: number,
  securities: Security[],
  investTxns: InvestTxn[],
  fxRate: number,
  hkdRate: number = 0.915
): NetWorthPoint[] {
  return months.map((m) => {
    const { end } = monthRange(m)
    const cash = cashBalance(txns, cashOpening, end)
    const debt = creditLiability(txns, end) + liabilitiesTotal(liabilities, txns, end)
    let invest = 0
    for (const s of securities) {
      const held = investTxns.filter(
        (t) => t.security_id === s.id && new Date(t.datetime).getTime() <= end
      )
      if (!held.length) continue
      invest += deriveHolding(s, held, fxRate, hkdRate).marketValueCNY
    }
    return { ym: m, net: cash - debt + invest, cash, invest, debt }
  })
}

// ===== 支出排行（单笔流水 TOP N，不按分类） =====
export function topExpenses(
  start: number,
  end: number,
  txns: Transaction[],
  limit = 10
): Transaction[] {
  return txns
    .filter((t) => {
      if (t.type !== 'expense' || t.is_repayment || t.is_investment_transfer) return false
      const ts = new Date(t.datetime).getTime()
      return ts >= start && ts <= end
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
}

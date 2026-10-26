import type { Security, Currency, Market } from '@/types'

// 分红数据源：东方财富为主 + 腾讯兜底（两条路都实测覆盖 A股 / 港股 / 美股，CORS 均开放）
//
// ① 东财 datacenter-web：一个接口换 reportName 覆盖三市场，返回结构化字段
//      A股  RPT_SHAREBONUS_DET        IMPL_PLAN_PROFILE / EQUITY_RECORD_DATE / EX_DIVIDEND_DATE
//                                     BONUS_RATIO(送股) / IT_RATIO(转增)
//      港股 RPT_HKF10_INFO_DIVIDEND   PLAN_EXPLAIN / RECORD_DATE / EX_DIVIDEND_DATE / DIVIDEND_DATE
//      美股 RPT_USF10_INFO_DIVIDEND   PLAN_EXPLAIN / EQUITY_RECORD_DATE / EX_DIVIDEND_DATE / BONUS_PAY_DATE
//    实测 A股方案文本还带「扣税后 X 元」，可据此反推适用税率。
//
// ② 腾讯 fqkline 系列：K 线在「除权日那一行」内嵌 { cqr, FHcontent, paixiri }
//      A股/ETF fqkline/get     sh600519 / sz000001
//      港股    hkfqkline/get   hk00700
//      美股    usfqkline/get   usAAPL.OQ —— 必须带交易所后缀，否则只返回 2 行
//    注意：腾讯单次最多约 641 行（≈2.5 年），历史深度不如东财，故仅作兜底。

const EM_API = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
const TX_API = 'https://web.ifzq.gtimg.cn/appstock/app'

export interface DividendPlan {
  // 去重键：证券ID|除权日|cash|split。不依赖接口返回的 ID（东财与腾讯的 ID 不通）
  key: string
  securityId: string
  period?: string // 报告期，如「2025末期」
  recordDate: string // 登记日 YYYY-MM-DD（算持股数用）
  exDate: string // 除权日 YYYY-MM-DD
  payDate?: string // 派息日
  cashPerShare: number // 每股税前（原币）
  bonusPer10: number // 送股（每 10 股送多少股）
  transferPer10: number // 转增（每 10 股转增多少股）
  currency: Currency
  profile: string // 原始方案文本，展示用
  status?: string // 实施分配 / 董事会预案
  source: 'eastmoney' | 'tencent'
}

export interface DividendEstimate {
  gross: number // 税前（原币）
  tax: number // 代扣税（原币）
  net: number // 到手（原币）—— 记账时进券商现金的就是这个数
  splitShares: number // 送转新增股数
}

// ===== 方案文本解析 =====

const day = (v: unknown): string => (v ? String(v).slice(0, 10) : '')

// 从方案文本解析「每股派息 / 送股 / 转增」，抹平三个市场的写法差异：
//   A股   10派308.76元 · 10派30.00元送5股转5股
//   港股  每股派港币5.3元 · 末期息5.3港元
//   美股  每1股派0.27美元股息 · 每股分配0.25美元
export function parsePlanText(text: string): {
  cashPerShare: number
  bonusPer10: number
  transferPer10: number
} {
  const t = (text ?? '').replace(/\s/g, '')
  let cashPerShare = 0

  // 港股 / 美股：每股派 X 元 · 每股分配 X 美元
  let m = t.match(/每股(?:派|分配|派息|股息)(?:港币|港元|美元|人民币|元)?([\d.]+)/)
  // 港股：末期息 5.3 港元 · 中期息 X 港元
  if (!m) m = t.match(/(?:末期息|中期息|股息)([\d.]+)(?:港元|港币|美元|元)/)
  if (m) cashPerShare = parseFloat(m[1]) || 0

  // 美股：每 N 股派 X 美元
  if (!cashPerShare) {
    m = t.match(/每([\d.]+)股派(?:美元|港币|元)?([\d.]+)/)
    if (m) cashPerShare = (parseFloat(m[2]) || 0) / (parseFloat(m[1]) || 1)
  }

  // A股：N 派 X 元（N 通常为 10）
  if (!cashPerShare) {
    m = t.match(/([\d.]+)派([\d.]+)元?/)
    if (m) cashPerShare = (parseFloat(m[2]) || 0) / (parseFloat(m[1]) || 10)
  }

  // 送股 / 转增：统一以「每 10 股」为基准
  const bonus = t.match(/送([\d.]+)股/)
  const transfer = t.match(/转增?([\d.]+)股/)
  return {
    // 抹掉浮点毛刺（如 276.73/10 → 27.673000000000002）
    cashPerShare: Math.round(cashPerShare * 1e6) / 1e6,
    bonusPer10: bonus ? parseFloat(bonus[1]) || 0 : 0,
    transferPer10: transfer ? parseFloat(transfer[1]) || 0 : 0,
  }
}

// ===== 东方财富（主源）=====

function emReportName(market: Market): string {
  if (market === 'hk') return 'RPT_HKF10_INFO_DIVIDEND'
  if (market === 'us') return 'RPT_USF10_INFO_DIVIDEND'
  return 'RPT_SHAREBONUS_DET'
}

async function emFetch(reportName: string, filter: string, pageSize = 30): Promise<any[] | null> {
  try {
    const q = new URLSearchParams({
      reportName,
      columns: 'ALL',
      filter,
      pageNumber: '1',
      pageSize: String(pageSize),
      source: 'WEB',
      client: 'WEB',
    })
    const r = await fetch(`${EM_API}?${q}`, {
      headers: { Referer: 'https://data.eastmoney.com/' },
    })
    if (!r.ok) return null
    const j = await r.json()
    if (!j?.success) return null
    const rows = j?.result?.data
    return Array.isArray(rows) && rows.length ? rows : null
  } catch {
    return null
  }
}

function fromEm(sec: Security, rows: any[]): DividendPlan[] {
  const out: DividendPlan[] = []
  for (const r of rows) {
    const profile = String(r.IMPL_PLAN_PROFILE ?? r.PLAN_EXPLAIN ?? '')
    const { cashPerShare, bonusPer10, transferPer10 } = parsePlanText(profile)
    const exDate = day(r.EX_DIVIDEND_DATE)
    if (!exDate) continue // 未实施的预案没有除权日
    if (!cashPerShare && !bonusPer10 && !transferPer10) continue // 「不分配不转增」等
    out.push({
      key: `${sec.id}|${exDate}|${cashPerShare > 0 ? 'cash' : 'split'}`,
      securityId: sec.id,
      period: r.ASSIGN_PERIOD ? String(r.ASSIGN_PERIOD) : undefined,
      // A股用 EQUITY_RECORD_DATE，港股用 RECORD_DATE，美股用 EQUITY_RECORD_DATE
      recordDate: day(r.EQUITY_RECORD_DATE ?? r.RECORD_DATE) || exDate,
      exDate,
      payDate: day(r.PAY_CASH_DATE ?? r.DIVIDEND_DATE ?? r.BONUS_PAY_DATE) || undefined,
      cashPerShare,
      bonusPer10,
      transferPer10,
      currency: sec.currency,
      profile,
      status: r.ASSIGN_PROGRESS ? String(r.ASSIGN_PROGRESS) : undefined,
      source: 'eastmoney',
    })
  }
  return out
}

// ===== 腾讯（兜底）=====

function txCodes(market: Market, code: string): string[] {
  const c = code.trim().toUpperCase()
  if (market === 'hk') return [`hk${c}`]
  // 美股必须带交易所后缀，后缀规则拿不到，依次尝试常见的
  if (market === 'us') return [`us${c}.OQ`, `us${c}.O`, `us${c}.N`]
  const first = c[0]
  if (first === '6' || first === '9') return [`sh${c}`]
  return [`sz${c}`]
}

async function txFetch(market: Market, sec: Security, years: number): Promise<DividendPlan[] | null> {
  const api = market === 'hk' ? 'hkfqkline/get' : market === 'us' ? 'usfqkline/get' : 'fqkline/get'
  // 交易日 ≈ 250 天/年，接口上限约 641 行（≈2.5 年）
  const count = Math.min(640, Math.max(320, Math.round(years * 250)))
  for (const code of txCodes(market, sec.code)) {
    try {
      const r = await fetch(`${TX_API}/${api}?param=${code},day,,,${count},qfq`, {
        headers: { Referer: 'https://gu.qq.com/' },
      })
      if (!r.ok) continue
      const j = await r.json()
      const node = j?.data?.[code]
      if (!node) continue
      const k = Object.keys(node).find((x) => x.includes('day'))
      if (!k) continue
      const rows = node[k]
      // 美股代码无后缀时会返回 2 行残数据，用行数把它筛掉，继续试下一个后缀
      if (!Array.isArray(rows) || rows.length < 10) continue

      const out: DividendPlan[] = []
      for (const row of rows) {
        const obj = row.find((x: unknown) => x && typeof x === 'object') as
          | Record<string, string>
          | undefined
        const fh = obj?.FHcontent
        if (!fh) continue
        const { cashPerShare, bonusPer10, transferPer10 } = parsePlanText(String(fh))
        if (!cashPerShare && !bonusPer10 && !transferPer10) continue
        const exDate = day(obj?.cqr ?? row[0])
        if (!exDate) continue
        out.push({
          key: `${sec.id}|${exDate}|${cashPerShare > 0 ? 'cash' : 'split'}`,
          securityId: sec.id,
          // 腾讯只给派息日（paixiri）不给登记日；除权日持仓 ≈ 登记日持仓，用它近似
          recordDate: exDate,
          exDate,
          payDate: day(obj?.paixiri) || undefined,
          cashPerShare,
          bonusPer10,
          transferPer10,
          currency: sec.currency,
          profile: String(fh),
          status: '已实施',
          source: 'tencent',
        })
      }
      if (out.length) return out
    } catch {
      continue
    }
  }
  return null
}

// ===== 对外入口 =====

// 拉取某证券近 N 年的分红方案（东财失败自动降级到腾讯）
export async function fetchDividendPlans(sec: Security, years = 3): Promise<DividendPlan[]> {
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - years)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const rows = await emFetch(emReportName(sec.market), `(SECURITY_CODE="${sec.code}")`, 30)
  let plans = rows ? fromEm(sec, rows) : []
  if (!plans.length) {
    const tx = await txFetch(sec.market, sec, years)
    if (tx) plans = tx
  }
  return plans
    .filter((p) => p.exDate >= cutoffStr)
    .filter((p) => !/不分配/.test(p.profile))
    .filter((p) => !p.status || !/预案/.test(p.status))
    .sort((a, b) => (a.exDate < b.exDate ? 1 : -1))
}

// 估算一笔分红：税前 / 代扣税 / 到手 / 送转新增股数（均为原币）
export function estimateDividend(
  plan: DividendPlan,
  shares: number,
  taxRate: number
): DividendEstimate {
  const sh = Math.max(0, shares)
  const gross = plan.cashPerShare * sh
  const tax = gross * taxRate
  const splitPer10 = plan.bonusPer10 + plan.transferPer10
  const splitShares = splitPer10 > 0 ? Math.round((sh * splitPer10) / 10) : 0
  return { gross, tax, net: gross - tax, splitShares }
}

// 默认税率（确认入账前可手动改）
//   A股：差别化红利税 —— 持股 >1 年免征，1 个月~1 年 10%，≤1 个月 20%
//        持股时长用「该证券最早一笔建仓」到登记日估算（近似，实际按先进先出逐笔算）
//   美股：非居民预扣 10%（中美税收协定）
//   港股：H 股 10% 红利税；香港本地股通常免税，故这里给 10% 可自行改成 0
//   ETF：分红免征
export function defaultTaxRate(
  sec: Security,
  recordTs: number,
  firstTs: number
): number {
  if (sec.market === 'etf') return 0
  if (sec.market === 'us' || sec.market === 'hk') return 0.1
  if (!firstTs || !recordTs) return 0.1
  const days = (recordTs - firstTs) / 86400000
  if (days > 365) return 0
  if (days > 30) return 0.1
  return 0.2
}

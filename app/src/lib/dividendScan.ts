import type { Security, InvestTxn } from '@/types'
import { sharesHeldAt, firstBuyTs } from '@/lib/calc'
import {
  fetchDividendPlans,
  estimateDividend,
  defaultTaxRate,
  type DividendPlan,
} from '@/lib/dividendService'

// 待入账分红的扫描与推导。
//
// 设计要点：
// 1) 只查「有持仓」的证券 —— 持仓通常就几只，一次几秒，没必要全量扫。
// 2) 不需要每天拉：分红是事件（A股一年 1 次、港股 2 次、美股 4 次）。
//    页面按需触发，7 天内不重复请求（节流时间戳存在 settings.dividendScanAt）。
// 3) 去重不依赖接口返回的 ID（东财与腾讯的 ID 不通），而是看台账里
//    「同证券 + 同除权日 + 同类型」是否已有记录 —— 换数据源也不会重复入账。
// 4) 持股数按「登记日当时」推导，不是当前持仓 —— 之前卖掉的仓位不该拿到分红。

export const SCAN_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface PendingDividend {
  // 去重键：证券ID|除权日|cash|split
  key: string
  kind: 'cash' | 'split'
  plan: DividendPlan
  security: Security
  shares: number // 登记日当时持股数
  taxRate: number
  gross: number // 税前（原币）
  tax: number // 代扣税（原币）
  net: number // 到手（原币）—— 进券商现金的数
  splitShares: number // 送转新增股数
  netCNY: number
}

// 内存缓存：同一次会话内不重复请求同一只证券
const planCache = new Map<string, DividendPlan[]>()

export function clearPlanCache() {
  planCache.clear()
}

// 该证券在台账里是否已对「该除权日 + 该类型」记过账
function alreadyPosted(investTxns: InvestTxn[], securityId: string, exDate: string, kind: 'cash' | 'split') {
  const wantType = kind === 'cash' ? 'dividend' : 'split'
  return investTxns.some(
    (t) => t.security_id === securityId && t.type === wantType && t.datetime.slice(0, 10) === exDate
  )
}

// 由已抓取的方案推导「待入账」清单
export function buildPending(
  securities: Security[],
  investTxns: InvestTxn[],
  plansBySec: Record<string, DividendPlan[]>,
  fxRate: number,
  hkdRate: number,
  ignored: string[]
): PendingDividend[] {
  const out: PendingDividend[] = []
  const now = Date.now()
  for (const s of securities) {
    const plans = plansBySec[s.id] ?? []
    for (const p of plans) {
      const exTs = new Date(`${p.exDate}T23:59:59`).getTime()
      if (!exTs || exTs > now) continue // 还没除权的不提示

      const recTs = new Date(`${p.recordDate}T23:59:59`).getTime()
      const shares = sharesHeldAt(s.id, investTxns, recTs || exTs)
      if (shares <= 0) continue // 登记日当时没持股

      const taxRate = defaultTaxRate(s, recTs || exTs, firstBuyTs(s.id, investTxns))
      const est = estimateDividend(p, shares, taxRate)
      const fx = s.currency === 'USD' ? fxRate : s.currency === 'HKD' ? hkdRate : 1

      // 现金分红与送转拆成两个待办项，各自独立去重 / 入账
      if (p.cashPerShare > 0 && est.net !== 0) {
        const key = `${s.id}|${p.exDate}|cash`
        if (!ignored.includes(key) && !alreadyPosted(investTxns, s.id, p.exDate, 'cash')) {
          out.push({
            key,
            kind: 'cash',
            plan: p,
            security: s,
            shares,
            taxRate,
            gross: est.gross,
            tax: est.tax,
            net: est.net,
            splitShares: 0,
            netCNY: est.net * fx,
          })
        }
      }
      if (est.splitShares > 0) {
        const key = `${s.id}|${p.exDate}|split`
        if (!ignored.includes(key) && !alreadyPosted(investTxns, s.id, p.exDate, 'split')) {
          out.push({
            key,
            kind: 'split',
            plan: p,
            security: s,
            shares,
            taxRate: 0,
            gross: 0,
            tax: 0,
            net: 0,
            splitShares: est.splitShares,
            netCNY: 0,
          })
        }
      }
    }
  }
  return out.sort((a, b) => (a.plan.exDate < b.plan.exDate ? 1 : -1))
}

// 拉取一批证券的分红方案（带内存缓存，force 用于「立即重新检测」）
export async function fetchPlansFor(
  securities: Security[],
  years: number,
  force: boolean
): Promise<Record<string, DividendPlan[]>> {
  const out: Record<string, DividendPlan[]> = {}
  await Promise.all(
    securities.map(async (s) => {
      if (!force && planCache.has(s.id)) {
        out[s.id] = planCache.get(s.id)!
        return
      }
      try {
        const p = await fetchDividendPlans(s, years)
        planCache.set(s.id, p)
        out[s.id] = p
      } catch {
        out[s.id] = planCache.get(s.id) ?? []
      }
    })
  )
  return out
}

// 是否需要真正发请求（7 天节流）
export function needScan(scanAt: string | undefined, force: boolean): boolean {
  if (force) return true
  if (!scanAt) return true
  const t = new Date(scanAt).getTime()
  if (!t) return true
  return Date.now() - t > SCAN_TTL_MS
}

import type { Currency } from '@/types'

const SYMBOL: Record<Currency, string> = { CNY: '¥', USD: '$', HKD: 'HK$' }

export function fmtMoney(
  amount: number,
  currency: Currency,
  opts?: { sign?: boolean; decimals?: number; compact?: boolean }
): string {
  const dec = opts?.decimals ?? 2
  const abs = Math.abs(amount)
  const sym = SYMBOL[currency]
  const sign = amount < 0 ? '-' : opts?.sign ? '+' : ''
  // 紧凑显示（仅 CNY，用于概览/汇总等窄位）：1万以上折算为「万」，1亿以上为「亿」
  if (opts?.compact && currency === 'CNY') {
    if (abs >= 1e8) return `${sign}${sym}${(abs / 1e8).toFixed(2)}亿`
    if (abs >= 1e4) return `${sign}${sym}${(abs / 1e4).toFixed(2)}万`
  }
  const formatted = abs.toLocaleString('zh-CN', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
  return `${sign}${sym}${formatted}`
}

// =¥ 折算展示（已折算为 CNY 的金额）
export function fmtCNY(amount: number, opts?: { sign?: boolean; decimals?: number }): string {
  return fmtMoney(amount, 'CNY', opts)
}

export function toCNY(amount: number, currency: Currency, fxRate: number, hkdRate = 0.915): number {
  if (currency === 'USD') return amount * fxRate
  if (currency === 'HKD') return amount * hkdRate
  return amount
}

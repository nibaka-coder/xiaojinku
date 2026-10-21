import type { Currency } from '@/types'

const SYMBOL: Record<Currency, string> = { CNY: '¥', USD: '$', HKD: 'HK$' }

export function fmtMoney(
  amount: number,
  currency: Currency,
  opts?: { sign?: boolean; decimals?: number }
): string {
  const dec = opts?.decimals ?? 2
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('zh-CN', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
  const sym = SYMBOL[currency]
  const sign = amount < 0 ? '-' : opts?.sign ? '+' : ''
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

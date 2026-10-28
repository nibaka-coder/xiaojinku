import { useStore } from '@/store/useStore'
import { fmtMoney, toCNY } from '@/lib/money'
import type { Currency } from '@/types'

export default function Money({
  amount,
  currency,
  showCny = true,
  sign = false,
  className = '',
}: {
  amount: number
  currency: Currency
  showCny?: boolean
  sign?: boolean
  className?: string
}) {
  const fx = useStore((s) => s.settings.fxRate.rate)
  const hkd = useStore((s) => s.settings.hkdRate.rate)

  if (currency === 'CNY') {
    return <span className={className}>{fmtMoney(amount, 'CNY', { sign })}</span>
  }

  const cny = toCNY(amount, currency, fx, hkd)
  if (!showCny) {
    return <span className={className}>{fmtMoney(amount, currency, { sign })}</span>
  }
  return (
    <span className={className} title={`≈ ¥${cny.toFixed(2)}`}>
      {fmtMoney(amount, currency, { sign })}
      <span className="text-sub text-xs ml-1">
        ≈¥{cny.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
      </span>
    </span>
  )
}

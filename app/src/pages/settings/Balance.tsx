import { useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { cashBalance, creditLiability, investSummary, liabilitiesTotal, netWorth } from '@/lib/calc'
import { fmtMoney } from '@/lib/money'
import SubPage, { Row } from './SubPage'

export default function Balance() {
  const transactions = useStore((s) => s.transactions)
  const liabilities = useStore((s) => s.liabilities)
  const securities = useStore((s) => s.securities)
  const investTxns = useStore((s) => s.investTxns)
  const cashOpening = useStore((s) => s.settings.cashOpening)
  const fxRate = useStore((s) => s.settings.fxRate.rate)
  const hkdRate = useStore((s) => s.settings.hkdRate.rate)
  const setCashOpening = useStore((s) => s.setCashOpening)

  const cash = useMemo(() => cashBalance(transactions, cashOpening), [transactions, cashOpening])
  const investMarket = useMemo(
    () => investSummary(securities, investTxns, fxRate, hkdRate).marketCNY,
    [securities, investTxns, fxRate, hkdRate]
  )
  const credit = useMemo(() => creditLiability(transactions), [transactions])
  const liabTotal = useMemo(
    () => liabilitiesTotal(liabilities, transactions),
    [liabilities, transactions]
  )
  const nw = useMemo(
    () => netWorth(transactions, liabilities, cashOpening, securities, investTxns, fxRate, hkdRate),
    [transactions, liabilities, cashOpening, securities, investTxns, fxRate, hkdRate]
  )

  return (
    <SubPage title="资产负债">
      <section className="card space-y-3">
        <Row label="现金余额" value={fmtMoney(cash, 'CNY')} />
        <Row label="投资市值" value={fmtMoney(investMarket, 'CNY')} />
        <Row label="信用贷款负债" value={fmtMoney(credit, 'CNY')} valueColor="var(--credit-text)" />
        <Row label="长期负债（车贷等）" value={fmtMoney(liabTotal, 'CNY')} valueColor="var(--danger-text)" />
        <div className="border-t border-soft pt-3 flex justify-between items-center">
          <span className="text-main font-medium">净资产</span>
          <span className="font-semibold text-main">{fmtMoney(nw, 'CNY')}</span>
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-medium text-main">期初现金余额</h2>
        <p className="text-xs text-sub">
          开始记账那天，你银行卡 / 微信 / 支付宝里已有的钱。之后每一笔收支都会在此基础上加减。
        </p>
        <input
          type="number"
          className="input"
          value={cashOpening}
          onChange={(e) => setCashOpening(Number(e.target.value) || 0)}
        />
      </section>
    </SubPage>
  )
}

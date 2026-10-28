import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import { fmtMoney } from '@/lib/money'
import { nowLocalISO } from '@/lib/date'
import { sharesHeldAt } from '@/lib/calc'
import {
  buildPending,
  fetchPlansFor,
  needScan,
  clearPlanCache,
  type PendingDividend,
} from '@/lib/dividendScan'
import { estimateDividend, type DividendPlan } from '@/lib/dividendService'

// 分红助手：半自动 —— 自动拉取方案、自动算登记日持股与税额、自动去重，
// 最后一步由你确认后入账。
// 不静默入账的原因：登记日持股数是从你的买入记录倒推的，若某笔买入日期记错，
// 静默入账会悄悄漏记或多记，且很难发现。一年就几次，点一下确认成本很低。

export default function DividendAssistant() {
  const navigate = useNavigate()
  const securities = useStore((s) => s.securities)
  const investTxns = useStore((s) => s.investTxns)
  const fxRate = useStore((s) => s.settings.fxRate.rate)
  const hkdRate = useStore((s) => s.settings.hkdRate.rate)
  const scanAt = useStore((s) => s.settings.dividendScanAt)
  const ignored = useStore((s) => s.settings.dividendIgnored ?? [])
  const setDividendScanAt = useStore((s) => s.setDividendScanAt)
  const toggleIgnored = useStore((s) => s.toggleDividendIgnored)
  const addInvestTxn = useStore((s) => s.addInvestTxn)

  const [loading, setLoading] = useState(false)
  const [plansBySec, setPlansBySec] = useState<Record<string, DividendPlan[]>>({})
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [shareEdits, setShareEdits] = useState<Record<string, string>>({})
  const [rateEdits, setRateEdits] = useState<Record<string, string>>({})
  const [doneMsg, setDoneMsg] = useState('')

  // 只查「当前有持仓」的证券：没持仓的不必拉，持仓通常就几只
  const held = useMemo(
    () => securities.filter((s) => sharesHeldAt(s.id, investTxns, Date.now()) > 0),
    [securities, investTxns]
  )

  const pending = useMemo(
    () => buildPending(held, investTxns, plansBySec, fxRate, hkdRate, ignored),
    [held, investTxns, plansBySec, fxRate, hkdRate, ignored]
  )

  const scan = useCallback(
    async (force: boolean) => {
      if (!held.length) return
      // 7 天节流：距离上次检查不足 7 天且本地已有结果时，不重复发请求
      if (!force && !needScan(scanAt, false) && Object.keys(plansBySec).length > 0) return
      setLoading(true)
      setDoneMsg('')
      const r = await fetchPlansFor(held, 2, force)
      setPlansBySec(r)
      setDividendScanAt(nowLocalISO())
      setLoading(false)
    },
    [held, scanAt, plansBySec, setDividendScanAt]
  )

  // 进入页面时按需检查一次（不阻塞渲染）
  useEffect(() => {
    scan(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 允许现场改股数 / 税率后重算
  const amountOf = (p: PendingDividend) => {
    const shRaw = parseFloat(shareEdits[p.key] ?? '')
    const sh = Number.isFinite(shRaw) && shRaw > 0 ? shRaw : p.shares
    const rateRaw = parseFloat(rateEdits[p.key] ?? '')
    const rate = Number.isFinite(rateRaw) ? Math.max(0, Math.min(1, rateRaw)) : p.taxRate
    return { sh, rate, ...estimateDividend(p.plan, sh, rate) }
  }

  const selected = pending.filter((p) => picked[p.key] ?? true)
  const totalNetCNY = selected.reduce((a, p) => {
    const est = amountOf(p)
    if (p.kind !== 'cash') return a
    const fx = p.security.currency === 'USD' ? fxRate : p.security.currency === 'HKD' ? hkdRate : 1
    return a + est.net * fx
  }, 0)

  const confirm = () => {
    if (!selected.length) return
    for (const p of selected) {
      const est = amountOf(p)
      const datetime = `${p.plan.exDate}T${nowLocalISO().slice(11)}`
      if (p.kind === 'cash') {
        // 记账约定：price = 每股税前，shares = 持股数，fee = 代扣税 → 到手 = shares×price − fee
        addInvestTxn({
          security_id: p.security.id,
          type: 'dividend',
          datetime,
          shares: est.sh,
          price: p.plan.cashPerShare,
          fee: est.tax,
          currency: p.security.currency,
          note: `分红助手入账 · ${p.plan.profile}`,
        })
      } else {
        // 送转：只加股数、不动成本 → 每股成本自动摊薄
        addInvestTxn({
          security_id: p.security.id,
          type: 'split',
          datetime,
          shares: est.splitShares,
          price: 0,
          fee: 0,
          currency: p.security.currency,
          note: `分红助手入账 · ${p.plan.profile}（送转摊薄成本）`,
        })
      }
    }
    setDoneMsg(`已入账 ${selected.length} 条，合计到手 ${fmtMoney(totalNetCNY, 'CNY')}`)
    setPicked({})
    setShareEdits({})
    setRateEdits({})
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-main">分红助手</h1>
        <button
          className="text-sm"
          style={{ color: 'var(--accent-strong)' }}
          onClick={() => {
            clearPlanCache()
            scan(true)
          }}
          disabled={loading}
        >
          {loading ? '检测中…' : '重新检测'}
        </button>
      </div>

      <div className="card-2 text-xs text-sub">
        自动拉取近 2 年分红方案（东财为主、腾讯兜底），按登记日持股数估算到手金额，确认后写入交易记录。
        {scanAt && `上次检测：${scanAt.slice(0, 10)}`}
        {scanAt && !needScan(scanAt, false) && '（7 天内不会重复请求）'}
      </div>

      {doneMsg && (
        <div className="card-2 text-sm" style={{ color: 'var(--income-text)', background: 'var(--accent-soft)' }}>
          ✓ {doneMsg}
        </div>
      )}

      {held.length === 0 && (
        <div className="card text-sm text-sub">当前没有持仓，无需检测分红。</div>
      )}

      {held.length > 0 && !loading && pending.length === 0 && (
        <div className="card text-sm text-sub">
          没有待入账的分红 —— 要么近期未分红，要么已全部入账。
        </div>
      )}

      {pending.length > 0 && (
        <>
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-main">待入账 {pending.length} 条</span>
              <span className="text-sm text-sub">
                已选 {selected.length} · 到手合计 {fmtMoney(totalNetCNY, 'CNY')}
              </span>
            </div>

            {pending.map((p) => {
              const est = amountOf(p)
              const fx =
                p.security.currency === 'USD' ? fxRate : p.security.currency === 'HKD' ? hkdRate : 1
              const on = picked[p.key] ?? true
              return (
                <div key={p.key} className="card-2 space-y-2">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setPicked((s) => ({ ...s, [p.key]: e.target.checked }))}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-main font-medium">
                        {p.security.name}
                        <span className="text-xs text-faint ml-1">
                          {p.security.code} · {p.kind === 'cash' ? '现金分红' : '送股/转增'}
                        </span>
                      </div>
                      <div className="text-xs text-faint">
                        除权 {p.plan.exDate} · 登记 {p.plan.recordDate}
                        {p.plan.period ? ` · ${p.plan.period}` : ''}
                      </div>
                      <div className="text-xs text-faint truncate">{p.plan.profile}</div>
                      <div className="text-xs text-faint">
                        数据源：{p.plan.source === 'eastmoney' ? '东方财富' : '腾讯'}
                      </div>
                    </div>
                  </label>

                  {p.kind === 'cash' ? (
                    <>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-sub w-16">股数</span>
                        <input
                          className="input !w-28"
                          type="number"
                          value={shareEdits[p.key] ?? String(p.shares)}
                          onChange={(e) => setShareEdits((s) => ({ ...s, [p.key]: e.target.value }))}
                        />
                        <span className="text-sub w-16">税率</span>
                        <input
                          className="input !w-24"
                          type="number"
                          step="0.01"
                          value={rateEdits[p.key] ?? String(p.taxRate)}
                          onChange={(e) => setRateEdits((s) => ({ ...s, [p.key]: e.target.value }))}
                        />
                      </div>
                      <div className="text-sm flex justify-between">
                        <span className="text-sub">
                          税前 {fmtMoney(est.gross, p.security.currency)} − 税{' '}
                          {fmtMoney(est.tax, p.security.currency)}
                        </span>
                        <span className="font-medium tabular-nums" style={{ color: 'var(--income-text)' }}>
                          到手 {fmtMoney(est.net, p.security.currency)}
                          {fx !== 1 && ` · ≈${fmtMoney(est.net * fx, 'CNY')}`}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm flex justify-between">
                      <span className="text-sub">
                        登记日持股 {p.shares} 股 · 送转 {p.plan.bonusPer10 + p.plan.transferPer10} 股/10 股
                      </span>
                      <span className="font-medium tabular-nums text-main">
                        +{est.splitShares} 股（成本摊薄）
                      </span>
                    </div>
                  )}

                  <button
                    className="text-xs"
                    style={{ color: 'var(--sub)' }}
                    onClick={() => toggleIgnored(p.key)}
                  >
                    忽略这条
                  </button>
                </div>
              )
            })}
          </div>

          <button className="btn-primary w-full h-12" onClick={confirm} disabled={!selected.length}>
            确认入账（{selected.length} 条）
          </button>
        </>
      )}

      {ignored.length > 0 && (
        <div className="card space-y-2">
          <div className="text-sm font-medium text-main">已忽略 {ignored.length} 条</div>
          {ignored.map((k) => (
            <div key={k} className="flex items-center justify-between text-xs text-sub">
              <span className="truncate">{k}</span>
              <button style={{ color: 'var(--accent-strong)' }} onClick={() => toggleIgnored(k)}>
                恢复
              </button>
            </div>
          ))}
        </div>
      )}

      <button className="btn-primary w-full h-12" onClick={() => navigate('/invest/holdings')}>
        返回持仓
      </button>
    </div>
  )
}

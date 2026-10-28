import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import { investSummary, deriveHolding, deriveLots, sharesHeldAt } from '@/lib/calc'
import { fmtMoney } from '@/lib/money'
import { nowLocalISO } from '@/lib/date'
import { buildPending, fetchPlansFor, needScan } from '@/lib/dividendScan'
import type { Market, Security } from '@/types'
import Modal from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import Skeleton from '@/components/Skeleton'
import Toast from '@/components/Toast'
import type { ToastTone } from '@/components/Toast'

const MARKET_LABEL: Record<Market, string> = { ashare: 'A股', us: '美股', hk: '港股', etf: 'ETF' }

// 红涨绿跌（仅投资模块）
function colorOf(v: number): string {
  return v >= 0 ? 'var(--expense-text)' : 'var(--income-text)'
}
function sign(v: number): string {
  return v >= 0 ? '+' : ''
}

// 行情更新时间（展示最新一只证券的行情时间，避免把旧价当实时价）
function quoteAgeText(iso?: string): string {
  if (!iso) return '尚未获取行情'
  const d = new Date(iso)
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return '行情更新于 刚刚'
  if (mins < 60) return `行情更新于 ${mins} 分钟前`
  if (mins < 60 * 24) return `行情更新于 ${Math.floor(mins / 60)} 小时前`
  const pad = (n: number) => String(n).padStart(2, '0')
  return `行情更新于 ${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function Holdings() {
  const navigate = useNavigate()
  const securities = useStore((s) => s.securities)
  const investTxns = useStore((s) => s.investTxns)
  const fxRate = useStore((s) => s.settings.fxRate.rate)
  const hkdRate = useStore((s) => s.settings.hkdRate.rate)
  const refreshQuotes = useStore((s) => s.refreshQuotes)
  const deleteSecurity = useStore((s) => s.deleteSecurity)
  const costBasis = useStore((s) => s.settings.costBasis ?? 'actual')
  const scanAt = useStore((s) => s.settings.dividendScanAt)
  const ignored = useStore((s) => s.settings.dividendIgnored ?? [])
  const setDividendScanAt = useStore((s) => s.setDividendScanAt)
  const [refreshing, setRefreshing] = useState(false)
  const [manageSec, setManageSec] = useState<Security | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // 每只证券的待入账分红条数（静默扫描后填入，用于持仓行角标）
  const [pendingBySec, setPendingBySec] = useState<Record<string, number>>({})

  const summary = useMemo(
    () => investSummary(securities, investTxns, fxRate, hkdRate, costBasis),
    [securities, investTxns, fxRate, hkdRate, costBasis]
  )
  const realized = useMemo(
    () => deriveLots(securities, investTxns, fxRate, hkdRate).totalRealizedCNY,
    [securities, investTxns, fxRate, hkdRate]
  )
  const holdings = useMemo(
    () =>
      securities
        .map((s) => deriveHolding(s, investTxns, fxRate, hkdRate, costBasis))
        .sort((a, b) => b.marketValueCNY - a.marketValueCNY),
    [securities, investTxns, fxRate, hkdRate, costBasis]
  )

  // 静默扫描待入账分红：只在挂载时跑一次，且距上次检查不足 7 天不发请求
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!needScan(scanAt, false)) return
      const heldSecs = securities.filter((s) => sharesHeldAt(s.id, investTxns, Date.now()) > 0)
      if (!heldSecs.length) return
      try {
        const plans = await fetchPlansFor(heldSecs, 2, false)
        const pend = buildPending(heldSecs, investTxns, plans, fxRate, hkdRate, ignored)
        const cnt: Record<string, number> = {}
        for (const p of pend) cnt[p.security.id] = (cnt[p.security.id] ?? 0) + 1
        if (cancelled) return
        setPendingBySec(cnt)
        setDividendScanAt(nowLocalISO())
      } catch {
        /* 扫描失败不影响持仓页正常使用 */
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pendingTotal = Object.values(pendingBySec).reduce((a, b) => a + b, 0)

  // 最新行情时间 = 各证券 quoteUpdatedAt 中最新的一条
  const latestQuoteAt = useMemo(() => {
    const times = securities
      .map((s) => s.quoteUpdatedAt)
      .filter((v): v is string => !!v)
      .sort()
    return times.length ? times[times.length - 1] : undefined
  }, [securities])

  // 刷新行情时顺带强制检测分红：已入账的按「证券+除权日+类型」自动去重，不会重复提醒
  const scanDividends = async () => {
    try {
      const heldSecs = securities.filter((s) => sharesHeldAt(s.id, investTxns, Date.now()) > 0)
      if (!heldSecs.length) return
      const plans = await fetchPlansFor(heldSecs, 2, true)
      const pend = buildPending(heldSecs, investTxns, plans, fxRate, hkdRate, ignored)
      const cnt: Record<string, number> = {}
      for (const p of pend) cnt[p.security.id] = (cnt[p.security.id] ?? 0) + 1
      setPendingBySec(cnt)
      setDividendScanAt(nowLocalISO())
    } catch {
      /* 检测失败不影响刷新行情 */
    }
  }

  const [toast, setToast] = useState<{ msg: string; tone: ToastTone } | null>(null)

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshQuotes(true)
      await scanDividends()
      setToast({ msg: '行情已更新', tone: 'success' })
    } catch {
      setToast({ msg: '行情刷新失败，请检查网络后重试', tone: 'error' })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-main">持仓总览</h1>
          <div className="text-xs text-faint mt-0.5">{quoteAgeText(latestQuoteAt)}</div>
        </div>
        <button className="btn-ghost text-sm" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? '刷新中…' : '↻ 刷新行情'}
        </button>
      </div>

      {/* 汇总：手机行式（标签左 · 金额右），≥sm 三列 */}
      <section className="card">
        <div className="space-y-2.5 sm:space-y-0 sm:grid sm:grid-cols-3 sm:gap-2 sm:text-center">
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <div className="text-xs text-faint">持仓市值</div>
            <div className="font-semibold tabular-nums">{fmtMoney(summary.marketCNY, 'CNY', { compact: true })}</div>
          </div>
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <div className="text-xs text-faint">总投入</div>
            <div className="font-semibold text-sub tabular-nums">{fmtMoney(summary.costCNY, 'CNY', { compact: true })}</div>
          </div>
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <div className="text-xs text-faint">累计盈亏</div>
            <div>
              <div className="font-semibold tabular-nums sm:mt-0.5" style={{ color: colorOf(summary.profitCNY) }}>
                {sign(summary.profitCNY)}
                {fmtMoney(summary.profitCNY, 'CNY', { compact: true })}
              </div>
              <div className="text-xs" style={{ color: colorOf(summary.profitCNY) }}>
                {sign(summary.profitPct)}
                {Math.round(summary.profitPct)}%
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 待入账分红总提示（刷新行情后检测得到，行内角标之外再给一条） */}
      {pendingTotal > 0 && (
        <button
          className="w-full text-left text-sm px-3 py-2.5 rounded-xl"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}
          onClick={() => navigate('/invest/dividends')}
        >
          💰 发现 {pendingTotal} 笔分红待入账 · 去确认 →
        </button>
      )}

      {/* 累计已实现盈亏（已卖出部分相对买入成本） */}
      <section className="card flex items-center justify-between">
        <span className="text-sm text-sub">累计已实现盈亏</span>
        <span className="font-semibold" style={{ color: colorOf(realized) }}>
          {sign(realized)}
          {fmtMoney(realized, 'CNY')}
        </span>
      </section>

      {/* 列表 */}
      {holdings.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="📈"
            title="还没有持仓"
            desc="记下第一笔买入后，这里会自动算出持仓市值与盈亏"
            actionText="去记一笔买入"
            onAction={() => navigate('/invest/add')}
          />
        </div>
      ) : refreshing ? (
        <div className="card">
          <Skeleton rows={Math.min(holdings.length, 4)} />
        </div>
      ) : (
        <div className="space-y-2">
          {holdings.map((h) => (
            <div key={h.security.id} className="card-2 w-full text-left">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-main truncate">
                    {h.security.name || h.security.code}
                    <span className="text-xs text-faint ml-1.5">{h.security.code}</span>
                  </div>
                  <div className="text-xs text-faint">
                    {MARKET_LABEL[h.security.market]} · {h.shares} 股 · 成本{' '}
                    {fmtMoney(h.avgCost, h.security.currency)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold">{fmtMoney(h.marketValueCNY, 'CNY')}</div>
                  <div className="text-xs" style={{ color: colorOf(h.profitCNY) }}>
                    {sign(h.profitCNY)}
                    {fmtMoney(h.profitCNY, 'CNY')}（{sign(h.profitPct)}
                    {Math.round(h.profitPct)}%）
                  </div>
                </div>
                <button
                  className="text-faint text-lg px-1 shrink-0"
                  onClick={() => setManageSec(h.security)}
                  aria-label="管理证券"
                >
                  ⋯
                </button>
              </div>
              {/* 待入账分红角标：静默扫描发现后提示，点进去一键确认 */}
              {pendingBySec[h.security.id] > 0 && (
                <button
                  className="mt-2 w-full text-left text-xs px-2.5 py-1.5 rounded-lg"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}
                  onClick={() => navigate('/invest/dividends')}
                >
                  💰 {pendingBySec[h.security.id]} 笔分红待入账 · 去确认 →
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 证券管理（删除等） */}
      <Modal
        open={!!manageSec}
        title="证券管理"
        onClose={() => {
          setManageSec(null)
          setConfirmingDelete(false)
        }}
        footer={
          confirmingDelete ? (
            <>
              <button
                className="btn-ghost flex-1"
                onClick={() => setConfirmingDelete(false)}
              >
                再想想
              </button>
              <button
                className="btn-danger flex-1"
                onClick={() => {
                  if (manageSec) {
                    deleteSecurity(manageSec.id)
                    setManageSec(null)
                    setConfirmingDelete(false)
                  }
                }}
              >
                确认删除
              </button>
            </>
          ) : (
            <>
              <button
                className="btn-ghost flex-1"
                onClick={() => {
                  setManageSec(null)
                  setConfirmingDelete(false)
                }}
              >
                取消
              </button>
              <button className="btn-danger flex-1" onClick={() => setConfirmingDelete(true)}>
                删除该证券
              </button>
            </>
          )
        }
      >
        {manageSec && (
          <div className="space-y-2 text-sub">
            <div className="flex items-center justify-between">
              <span className="font-medium text-main">{manageSec.name}</span>
              <span className="text-xs text-faint">{manageSec.code}</span>
            </div>
            <div className="text-xs text-faint">
              {MARKET_LABEL[manageSec.market]} · {manageSec.currency} ·{' '}
              {investTxns.filter((t) => t.security_id === manageSec.id).length} 笔交易
            </div>
            {confirmingDelete && (
              <div
                className="mt-2 rounded-lg p-3 text-sm"
                style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger-text)' }}
              >
                ⚠️ 确认删除「{manageSec.name}」吗？该证券及其全部交易将永久删除，不可撤销。
              </div>
            )}
          </div>
        )}
      </Modal>

      {toast && (
        <Toast open={!!toast} message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />
      )}
    </div>
  )
}

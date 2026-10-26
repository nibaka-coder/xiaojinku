import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import Modal from '@/components/Modal'
import { todayDateISO, nowLocalISO } from '@/lib/date'
import { liabilityCurrentBalance } from '@/lib/calc'
import { fmtMoney } from '@/lib/money'
import type { FundSource } from '@/types'

type TxnType = 'expense' | 'income'

type Mode = 'expense' | 'income' | 'repayment' | 'transfer'
const MODES: { key: Mode; label: string }[] = [
  { key: 'expense', label: '支出' },
  { key: 'income', label: '收入' },
  { key: 'repayment', label: '还款' },
  { key: 'transfer', label: '转账' },
]

const FUND_SOURCES: { key: FundSource; label: string; icon: string }[] = [
  { key: 'cash', label: '现金', icon: '💵' },
  { key: 'credit', label: '信用贷款', icon: '💳' },
]

export default function AddTransaction() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('edit')

  const categories = useStore((s) => s.categories)
  const transactions = useStore((s) => s.transactions)
  const liabilities = useStore((s) => s.liabilities)
  const addTransaction = useStore((s) => s.addTransaction)
  const updateTransaction = useStore((s) => s.updateTransaction)
  const deleteTransaction = useStore((s) => s.deleteTransaction)

  const [type, setType] = useState<TxnType>('expense')
  const [amountStr, setAmountStr] = useState('')
  const [fundSource, setFundSource] = useState<FundSource>('cash')
  const [categoryId, setCategoryId] = useState('')
  const [payee, setPayee] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayDateISO())
  const [isRepayment, setIsRepayment] = useState(false)
  const [isTransfer, setIsTransfer] = useState(false)
  const [transferDir, setTransferDir] = useState<'out' | 'in'>('out')
  const [repayTarget, setRepayTarget] = useState('')
  // 摊销：车险/年度会员等一次性支出，按区间分摊到每月成本（仅影响统计口径）
  const [amortizeOn, setAmortizeOn] = useState(false)
  const [amortizeStartYm, setAmortizeStartYm] = useState(() => todayDateISO().slice(0, 7))
  const [amortizeMonths, setAmortizeMonths] = useState('12')
  const [showMore, setShowMore] = useState(false)
  const [showDelConfirm, setShowDelConfirm] = useState(false)
  const mode: Mode = isRepayment ? 'repayment' : isTransfer ? 'transfer' : type

  // 还款对象下拉：信用池 + 各长期负债（信用池永远存在）
  const liabOptions = useMemo(() => {
    const arr = liabilities.map((l) => ({ id: l.id, name: l.name, icon: l.icon ?? '📦', kind: l.kind }))
    if (!arr.some((o) => o.kind === 'credit')) {
      arr.unshift({ id: 'credit_pool', name: '信用贷款', icon: '💳', kind: 'credit' as const })
    }
    return arr
  }, [liabilities])
  const effectiveTarget = repayTarget || liabOptions[0]?.id || 'credit_pool'
  const targetObj = liabilities.find((l) => l.id === effectiveTarget)
  const targetBalance = targetObj ? liabilityCurrentBalance(targetObj, transactions) : 0

  useEffect(() => {
    if (!editId) return
    const t = transactions.find((x) => x.id === editId)
    if (!t) return
    setType(t.type)
    setAmountStr(String(t.amount))
    setFundSource(t.fund_source)
    setCategoryId(t.category_id || '')
    setPayee(t.payee || '')
    setNote(t.note || '')
    setIsRepayment(!!t.is_repayment)
    setIsTransfer(!!t.is_investment_transfer)
    setTransferDir(t.type === 'income' ? 'in' : 'out')
    setRepayTarget(t.liability_id || '')
    setDate(t.datetime.slice(0, 10))
    setAmortizeOn(!!t.amortize_months && !!t.amortize_start_ym)
    setAmortizeStartYm(t.amortize_start_ym || t.datetime.slice(0, 7))
    setAmortizeMonths(t.amortize_months ? String(t.amortize_months) : '12')
  }, [editId, transactions])

  const expenseCats = useMemo(
    () => categories.filter((c) => c.type === 'expense').sort((a, b) => a.order - b.order),
    [categories]
  )
  const incomeCats = useMemo(
    () => categories.filter((c) => c.type === 'income').sort((a, b) => a.order - b.order),
    [categories]
  )
  const activeCats = type === 'income' ? incomeCats : expenseCats

  const amount = parseFloat(amountStr) || 0
  const canSave = amount > 0 && (isRepayment ? !!effectiveTarget : isTransfer ? true : !!categoryId)
  const finalType: TxnType = isTransfer ? (transferDir === 'out' ? 'expense' : 'income') : type
  // 摊销：仅普通支出可用（还款与投资转账不摊销）
  const canAmortize = amortizeOn && finalType === 'expense' && !isRepayment && !isTransfer
  const months = Math.max(1, Math.floor(Number(amortizeMonths) || 0))
  const perMonth = canAmortize && months > 0 ? amount / months : 0
  const endYm = (() => {
    if (!canAmortize) return ''
    const [y, m] = amortizeStartYm.split('-').map(Number)
    const d = new Date(y, m - 1 + months - 1, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()

  const submit = () => {
    if (!canSave) return
    const dt = `${date}T${nowLocalISO().slice(11)}`
    const base = {
      type: finalType,
      amount,
      currency: 'CNY' as const,
      fund_source: finalType === 'income' ? 'cash' : fundSource,
      category_id: isRepayment || isTransfer ? undefined : categoryId || undefined,
      payee: finalType === 'income' ? undefined : payee || undefined,
      note: note || undefined,
      datetime: dt,
      is_repayment: isRepayment || undefined,
      liability_id: isRepayment ? effectiveTarget : undefined,
      is_investment_transfer: isTransfer || undefined,
      // 摊销仅在支出（非还款/转账）时生效
      amortize_start_ym: canAmortize ? amortizeStartYm : undefined,
      amortize_months: canAmortize ? months : undefined,
    }
    if (editId) {
      updateTransaction({ ...base, id: editId })
      navigate('/transactions')
    } else {
      addTransaction(base)
      setAmountStr('')
      setPayee('')
      setNote('')
      setCategoryId('')
      setAmortizeOn(false)
    }
  }

  const onDelete = () => {
    if (!editId) return
    setShowDelConfirm(true)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-main">{editId ? '编辑交易' : '记账'}</h1>
        {editId && (
          <button onClick={onDelete} className="text-sm" style={{ color: 'var(--danger)' }}>
            删除
          </button>
        )}
      </div>

      <div className="seg w-full">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => {
              if (m.key === 'repayment') {
                setIsRepayment(true)
                setIsTransfer(false)
                setType('expense')
              } else if (m.key === 'transfer') {
                setIsTransfer(true)
                setIsRepayment(false)
                setTransferDir('out')
                setFundSource('cash')
              } else {
                setIsRepayment(false)
                setIsTransfer(false)
                setType(m.key)
              }
              setCategoryId('')
            }}
            className={`seg-item flex-1 whitespace-nowrap ${mode === m.key ? 'seg-item-active' : ''}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 金额输入 */}
      <div className="card-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-semibold text-main">¥</span>
          <input
            type="text"
            inputMode="decimal"
            className="flex-1 bg-transparent text-3xl font-semibold text-main outline-none tabular-nums"
            placeholder="0.00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.]/g, ''))}
          />
        </div>
      </div>

      {isTransfer && (
        <div className="space-y-3">
          <div className="seg w-full">
            <button
              onClick={() => setTransferDir('out')}
              className={`seg-item flex-1 ${transferDir === 'out' ? 'seg-item-active' : ''}`}
            >
              转出（现金 → 券商）
            </button>
            <button
              onClick={() => setTransferDir('in')}
              className={`seg-item flex-1 ${transferDir === 'in' ? 'seg-item-active' : ''}`}
            >
              回收（券商 → 现金）
            </button>
          </div>
          <div className="card-2 text-sm" style={{ color: 'var(--accent-strong)', background: 'var(--accent-soft)' }}>
            📌 投资转账只影响现金余额，不计入日常开销、预算与分类统计。买股选「转出」，卖出回款选「回收」。
          </div>
        </div>
      )}

      {!isRepayment && !isTransfer && (
        <div>
          <label className="label">分类</label>
          <div className="grid grid-cols-4 gap-2">
            {activeCats.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-xs transition ${
                  categoryId === c.id ? 'border-0 text-white' : 'border-soft text-sub hover:bg-card-2'
                }`}
                style={
                  categoryId === c.id
                    ? { background: 'var(--accent)', boxShadow: '0 4px 14px var(--accent-soft)' }
                    : undefined
                }
              >
                <span className="text-xl">{c.icon}</span>
                <span>{c.name}</span>
              </button>
            ))}
          </div>
          {activeCats.length === 0 && (
            <p className="text-xs text-faint mt-1">暂无分类，请到「设置 → 分类管理」添加</p>
          )}
        </div>
      )}

      {!isRepayment && !isTransfer && type === 'expense' && (
        <div>
          <label className="label">资金来源</label>
          <div className="seg w-full">
            {FUND_SOURCES.map((f) => (
              <button
                key={f.key}
                onClick={() => setFundSource(f.key)}
                className={`seg-item ${fundSource === f.key ? 'seg-item-active' : ''}`}
              >
                {f.icon} {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 摊销：车险 / 年度会员等按区间分摊成本（仅支出；收入不显示） */}
      {!isRepayment && !isTransfer && type === 'expense' && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setAmortizeOn((v) => !v)}
            className="flex w-full items-center justify-between"
          >
            <span className="label">按区间摊销（车险 / 会员等）</span>
            <span
              className="text-xs px-2 py-1 rounded-full"
              style={{
                background: amortizeOn ? 'var(--accent-soft)' : 'var(--card-2)',
                color: amortizeOn ? 'var(--accent-strong)' : 'var(--faint)',
              }}
            >
              {amortizeOn ? '已开启' : '关闭'}
            </span>
          </button>
          {amortizeOn && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">起摊月</label>
                  <input
                    type="month"
                    className="input"
                    value={amortizeStartYm}
                    onChange={(e) => setAmortizeStartYm(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">摊销期数（月）</label>
                  <input
                    type="number"
                    min={1}
                    className="input"
                    value={amortizeMonths}
                    onChange={(e) => setAmortizeMonths(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="如 12"
                  />
                </div>
              </div>
              <div
                className="card-2 text-sm"
                style={{ color: 'var(--accent-strong)', background: 'var(--accent-soft)' }}
              >
                📌 {amortizeStartYm} ~ {endYm} 共 {months} 个月，每月计入成本{' '}
                <strong>{fmtMoney(perMonth, 'CNY')}</strong>
                {amount > 0 && `（总额 ${fmtMoney(amount, 'CNY')}）`}。
                <br />
                现金余额与净资产仍按今日实际支出 <strong>{fmtMoney(amount, 'CNY')}</strong> 计算，仅统计口径按月分摊。
              </div>
            </>
          )}
        </div>
      )}

      {isRepayment && (
        <div className="space-y-3">
          <div>
            <label className="label">还款对象</label>
            <select
              className="input"
              value={effectiveTarget}
              onChange={(e) => setRepayTarget(e.target.value)}
            >
              {liabOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.icon} {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="card-2 text-sm" style={{ color: 'var(--credit)', background: 'var(--credit-soft)' }}>
            ✅ 这是一笔还款：将从现金扣减，并冲减「{targetObj?.name ?? '信用贷款'}」当前待还 {fmtMoney(targetBalance, 'CNY')}。
          </div>
        </div>
      )}

      {/* 更多（日期 / 商户 / 备注），默认收起 */}
      <div>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="label flex w-full items-center justify-between"
        >
          <span>更多（日期{type === 'income' ? '' : ' / 商户'} / 备注）</span>
          <span className="text-faint">{showMore ? '收起 ▲' : '展开 ▼'}</span>
        </button>
        {showMore && (
          <div className="space-y-3 mt-2">
            <div>
              <label className="label">日期</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {type !== 'income' && (
              <div>
                <label className="label">商户 / 对方</label>
                <input
                  className="input"
                  placeholder="如：麦当劳、房东"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="label">备注</label>
              <input
                className="input"
                placeholder="可选"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      <button onClick={submit} disabled={!canSave} className="btn-primary w-full h-12 text-base">
        {editId ? '保存修改' : '保存并继续记账'}
      </button>

      {showDelConfirm && (
        <Modal
          title="删除交易"
          onClose={() => setShowDelConfirm(false)}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setShowDelConfirm(false)}>
                取消
              </button>
              <button
                className="btn-primary"
                style={{ background: 'var(--danger)' }}
                onClick={() => {
                  if (!editId) return
                  deleteTransaction(editId)
                  setShowDelConfirm(false)
                  navigate('/transactions')
                }}
              >
                删除
              </button>
            </>
          }
        >
          <p className="text-sm text-sub">确定删除这笔交易吗？删除后不可恢复。</p>
        </Modal>
      )}
    </div>
  )
}

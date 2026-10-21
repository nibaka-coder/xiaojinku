import { useMemo, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import { deriveLots } from '@/lib/calc'
import { fmtMoney } from '@/lib/money'
import { todayDateISO, nowLocalISO } from '@/lib/date'
import { secidFor } from '@/lib/quoteService'
import type { Currency, InvestTxnType, Market } from '@/types'
import Modal from '@/components/Modal'

const TYPES: { key: InvestTxnType; label: string }[] = [
  { key: 'buy', label: '买入' },
  { key: 'sell', label: '卖出' },
  { key: 'dividend', label: '分红' },
]
const MARKETS: { key: Market; label: string; cur: Currency }[] = [
  { key: 'ashare', label: 'A股', cur: 'CNY' },
  { key: 'us', label: '美股', cur: 'USD' },
  { key: 'hk', label: '港股', cur: 'HKD' },
  { key: 'etf', label: 'ETF', cur: 'CNY' },
]

export default function AddInvestTxn() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('edit')
  const presetSec = params.get('security')

  const securities = useStore((s) => s.securities)
  const investTxns = useStore((s) => s.investTxns)
  const fxRate = useStore((s) => s.settings.fxRate.rate)
  const hkdRate = useStore((s) => s.settings.hkdRate.rate)
  const addSecurity = useStore((s) => s.addSecurity)
  const addInvestTxn = useStore((s) => s.addInvestTxn)
  const updateInvestTxn = useStore((s) => s.updateInvestTxn)
  const deleteInvestTxn = useStore((s) => s.deleteInvestTxn)

  const editTxn = editId ? investTxns.find((t) => t.id === editId) : undefined

  const [showNew, setShowNew] = useState(false)
  const [secId, setSecId] = useState(editTxn?.security_id ?? presetSec ?? securities[0]?.id ?? '')
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newMarket, setNewMarket] = useState<Market>('ashare')
  const initType: InvestTxnType = !editTxn ? 'buy' : editTxn.type
  const [type, setType] = useState<InvestTxnType>(initType)
  const [shares, setShares] = useState(editTxn ? String(editTxn.shares) : '')
  const [price, setPrice] = useState(editTxn ? String(editTxn.price) : '')
  const [fee, setFee] = useState(editTxn ? String(editTxn.fee) : '0')
  const [date, setDate] = useState(editTxn ? editTxn.datetime.slice(0, 10) : todayDateISO())
  const [note, setNote] = useState(editTxn?.note ?? '')
  const [showMore, setShowMore] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [lotInputs, setLotInputs] = useState<Record<string, string>>({})
  const manualEditRef = useRef(false) // 用户是否手动改过批次分配（改过则不再随股数自动填充）
  const prevShRef = useRef<number | null>(null)

  const newCurrency: Currency =
    newMarket === 'us' ? 'USD' : newMarket === 'hk' ? 'HKD' : 'CNY'
  const newSecid = secidFor(newMarket, newCode)

  const p = parseFloat(price) || 0
  const sh = parseFloat(shares) || 0
  const needShares = type !== 'dividend'

  // 卖出批次：从台账推导该证券可卖批（剩余>0）
  const derived = useMemo(
    () => deriveLots(securities, investTxns, fxRate, hkdRate),
    [securities, investTxns, fxRate, hkdRate]
  )
  const openLots = useMemo(
    () => (type === 'sell' && !showNew && secId ? (derived.lots[secId] ?? []).filter((l) => l.remaining > 0) : []),
    [type, showNew, secId, derived]
  )

  // 切换为卖出 / 换证券 / 编辑时，初始化批次分配（手动配对优先，否则 FIFO 填满股数）
  useEffect(() => {
    manualEditRef.current = false
    prevShRef.current = null
    if (type === 'sell' && !showNew && secId) {
      const base: Record<string, string> = {}
      if (editTxn?.matchedLots?.length) {
        for (const ml of editTxn.matchedLots) base[ml.lotId] = String(ml.shares)
      } else {
        let need = sh
        for (const l of openLots) {
          const take = Math.min(l.remaining, need)
          if (take > 0) base[l.lotId] = String(take)
          need -= take
          if (need <= 0) break
        }
      }
      setLotInputs(base)
    } else {
      setLotInputs({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, showNew, secId, editId])

  // 卖出股数变化时，若用户未手动改过批次，则按 FIFO 重新填满股数（避免初次进来 sh=0 没分配）
  useEffect(() => {
    if (type !== 'sell' || showNew || !secId || editId) return
    if (manualEditRef.current) return
    if (prevShRef.current === sh) return
    prevShRef.current = sh
    let need = sh
    const base: Record<string, string> = {}
    for (const l of openLots) {
      const take = Math.min(l.remaining, need)
      if (take > 0) base[l.lotId] = String(take)
      need -= take
      if (need <= 0) break
    }
    setLotInputs(base)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sh, openLots, type, showNew, secId, editId])

  const allocatedShares = openLots.reduce((a, l) => a + (parseFloat(lotInputs[l.lotId] ?? '0') || 0), 0)
  // 本次卖出预计已实现盈亏（原币，含整笔卖出费）
  const previewPL = openLots.reduce(
    (a, l) => a + (p - l.costPerShare) * (parseFloat(lotInputs[l.lotId] ?? '0') || 0),
    0
  ) - (allocatedShares > 0 ? parseFloat(fee) || 0 : 0)
  const secCurrency: Currency = securities.find((s) => s.id === secId)?.currency ?? newCurrency
  const previewPLCNY =
    previewPL * (secCurrency === 'USD' ? fxRate : secCurrency === 'HKD' ? hkdRate : 1)

  const sellOk =
    type !== 'sell' ||
    (!showNew && !!secId && allocatedShares > 0 && Math.abs(allocatedShares - sh) < 1e-6)
  const canSave =
    (showNew ? !!newCode.trim() : !!secId) && p > 0 && (!needShares || sh > 0) && sellOk
  const missing: string[] = []
  if (showNew ? !newCode.trim() : !secId) missing.push('证券代码')
  if (p <= 0) missing.push('单价')
  if (needShares && sh <= 0) missing.push('股数')
  if (type === 'sell' && !showNew && secId && allocatedShares > 0 && Math.abs(allocatedShares - sh) > 1e-6)
    missing.push(`批次合计 ${allocatedShares} 股 ≠ 卖出 ${sh} 股`)
  if (type === 'sell' && allocatedShares <= 0) missing.push('卖出批次')

  const submit = () => {
    if (!canSave) return
    let sid = secId
    if (showNew && newCode.trim()) {
      sid = addSecurity({
        code: newCode.trim().toUpperCase(),
        name: newName.trim(),
        market: newMarket,
        currency: newCurrency,
        secid: newSecid,
        note: '',
      })
    }
    const sec = securities.find((s) => s.id === sid)
    const currency = sec?.currency ?? newCurrency
    const matchedLots =
      type === 'sell'
        ? openLots
            .map((l) => ({ lotId: l.lotId, shares: parseFloat(lotInputs[l.lotId] ?? '0') || 0 }))
            .filter((m) => m.shares > 0)
        : undefined
    const data = {
      security_id: sid,
      type,
      datetime: `${date}T${nowLocalISO().slice(11)}`,
      shares: sh,
      price: p,
      fee: parseFloat(fee) || 0,
      currency,
      note: note || undefined,
      matchedLots,
    }
    if (editId) updateInvestTxn({ id: editId, ...data })
    else addInvestTxn(data)
    navigate('/invest/holdings')
  }

  const onDelete = () => {
    if (editId) deleteInvestTxn(editId)
    navigate('/invest/holdings')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button className="text-xl text-sub" onClick={() => navigate(-1)}>
          ‹
        </button>
        <h1 className="text-lg font-semibold text-main">{editId ? '编辑交易' : '记一笔投资'}</h1>
      </div>

      {/* 类型 */}
      <div className="seg w-full">
        {TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => setType(t.key)}
            className={`seg-item flex-1 ${type === t.key ? 'seg-item-active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 证券选择 */}
      {!showNew ? (
        <div className="card-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-sub">证券</span>
            <button className="text-sm" style={{ color: 'var(--accent-strong)' }} onClick={() => setShowNew(true)}>
              ＋ 新建
            </button>
          </div>
          <select className="input" value={secId} onChange={(e) => setSecId(e.target.value)}>
            {securities.length === 0 && <option value="">（暂无，请新建）</option>}
            {securities.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}（{s.code}）
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="card-2 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-sub">新建证券</span>
            <button className="text-sm" style={{ color: 'var(--accent-strong)' }} onClick={() => setShowNew(false)}>
              选已有
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="代码，如 600519 / AAPL" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
            <input className="input" placeholder="名称（留空用代码）" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div className="flex gap-2">
            {MARKETS.map((m) => (
              <button
                key={m.key}
                onClick={() => setNewMarket(m.key)}
                className={`chip flex-1 ${newMarket === m.key ? 'chip-active' : ''}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="text-xs text-faint">行情代码将自动生成：{newCode.trim() ? newSecid : '—'}（{newCurrency}）</div>
        </div>
      )}

      {/* 股数 / 单价 */}
      <div className="card-2 space-y-2">
        <div>
          <label className="label">
            {type === 'dividend' ? '股数（可选，留空则单价按总额）' : '股数'}
          </label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            placeholder={type === 'dividend' ? '0' : '请输入股数'}
            value={shares}
            onChange={(e) => setShares(e.target.value)}
          />
        </div>
        <div>
          <label className="label">{type === 'dividend' ? '每股分红（或总额）' : '单价（原币）'}</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
      </div>

      {/* 卖出批次配对（手动指定，默认 FIFO 填满股数） */}
      {type === 'sell' && !showNew && secId && (
        <div className="card-2 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-sub">选择卖出批次</span>
            <span className="text-xs text-faint">已分配 {allocatedShares} / 卖出 {sh} 股</span>
          </div>
          {openLots.length === 0 ? (
            <p className="text-xs text-faint">该证券暂无可卖批次，请先买入。</p>
          ) : (
            openLots.map((l) => (
              <div key={l.lotId} className="flex items-center gap-2">
                <div className="flex-1 min-w-0 text-xs">
                  <div className="text-main truncate">成本 {fmtMoney(l.costPerShare, secCurrency)}</div>
                  <div className="text-faint">
                    {l.openedAt.slice(0, 10)} · 剩 {l.remaining} 股
                  </div>
                </div>
                <input
                  className="input w-24 text-right"
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={lotInputs[l.lotId] ?? ''}
                  onChange={(e) => {
                    manualEditRef.current = true
                    setLotInputs((v) => ({ ...v, [l.lotId]: e.target.value }))
                  }}
                />
              </div>
            ))
          )}
          {allocatedShares > 0 && (
            <div className="text-sm" style={{ color: previewPL >= 0 ? 'var(--expense)' : 'var(--income)' }}>
              预计已实现盈亏 {previewPL >= 0 ? '+' : ''}
              {fmtMoney(previewPL, secCurrency)}（≈{fmtMoney(previewPLCNY, 'CNY')}）
            </div>
          )}
        </div>
      )}

      {/* 更多 */}
      <button className="text-sm text-sub w-full text-left" onClick={() => setShowMore((v) => !v)}>
        {showMore ? '收起' : '更多 ▾'}
      </button>
      {showMore && (
        <div className="card-2 space-y-2">
          <div>
            <label className="label">费用（原币，默认 0）</label>
            <input className="input" type="number" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
          <div>
            <label className="label">日期</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">备注</label>
            <input className="input" placeholder="选填" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      )}

      <button className="btn-primary w-full h-12 text-base" disabled={!canSave} onClick={submit}>
        {editId ? '保存修改' : '保存'}
      </button>
      {!canSave && (
        <p className="text-xs text-faint text-center">还差：{missing.join('、')}未填写</p>
      )}

      {editId && (
        <button className="btn-ghost w-full text-sm" style={{ color: 'var(--danger)' }} onClick={() => setDelOpen(true)}>
          删除该笔交易
        </button>
      )}

      <Modal open={delOpen} title="删除交易" onClose={() => setDelOpen(false)}>
        <p className="text-sub mb-4">确定删除该笔交易？此操作不可撤销。</p>
        <div className="flex gap-3">
          <button className="btn-ghost flex-1" onClick={() => setDelOpen(false)}>
            取消
          </button>
          <button className="btn-danger flex-1" onClick={onDelete}>
            删除
          </button>
        </div>
      </Modal>
    </div>
  )
}

import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { liabilityCurrentBalance } from '@/lib/calc'
import { fmtMoney } from '@/lib/money'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import SubPage from './SubPage'
import type { Liability, Transaction } from '@/types'

const LIAB_ICONS = ['🚗', '🏠', '🎓', '💊', '💼', '📦']

export default function Liabilities() {
  const liabilities = useStore((s) => s.liabilities)
  const transactions = useStore((s) => s.transactions)
  const addLiability = useStore((s) => s.addLiability)
  const updateLiability = useStore((s) => s.updateLiability)
  const deleteLiability = useStore((s) => s.deleteLiability)

  // 仅管理长期负债（信用贷款为单一资金池，不在列表内编辑）
  const loans = liabilities.filter((l) => l.kind !== 'credit')
  const [editing, setEditing] = useState<Partial<Liability> | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const save = () => {
    if (!editing || !editing.name?.trim()) return
    const data = {
      name: editing.name.trim(),
      kind: 'loan' as const,
      balance: Number(editing.balance) || 0,
      currency: 'CNY' as const,
      monthly_payment: editing.monthly_payment,
      remaining_terms: editing.remaining_terms,
      icon: editing.icon,
      note: editing.note,
    }
    if (editing.id) onUpdate({ id: editing.id, ...data })
    else addLiability(data)
    setEditing(null)
  }
  const onUpdate = (l: Partial<Liability> & { id: string }) => updateLiability(l)
  const onDeleteConfirm = () => {
    if (editing?.id) {
      deleteLiability(editing.id)
      setEditing(null)
      setConfirmDel(false)
    }
  }
  const repaidForEdit = transactions
    .filter((t) => t.is_repayment && t.liability_id === editing?.id)
    .reduce((s, t) => s + t.amount, 0)
  const editingCurrent = Math.max(0, (editing?.balance ?? 0) - repaidForEdit)

  return (
    <SubPage title="长期负债">
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-main">长期负债</h2>
          <button
            className="text-sm font-medium"
            style={{ color: 'var(--accent-strong)' }}
            onClick={() => setEditing({ name: '', balance: 0, icon: '🚗', kind: 'loan' })}
          >
            ＋ 新增
          </button>
        </div>
        <div className="space-y-2">
          {loans.map((l) => (
            <button
              key={l.id}
              onClick={() => setEditing({ ...l })}
              className="card-2 w-full text-left flex items-center gap-3 active:bg-[var(--border)]"
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 bg-card-2">
                {l.icon ?? '📦'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-main">{l.name}</div>
                <div className="text-xs text-faint">
                  {l.note ? `${l.note} · ` : ''}月供 {fmtMoney(l.monthly_payment ?? 0, 'CNY')} · 剩{' '}
                  {l.remaining_terms ?? '—'} 期
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-semibold" style={{ color: 'var(--danger)' }}>
                  待还 {fmtMoney(liabilityCurrentBalance(l, transactions), 'CNY')}
                </div>
              </div>
            </button>
          ))}
          {loans.length === 0 && <p className="text-sm text-faint">暂无长期负债</p>}
        </div>
      </section>

      {editing && (
        <Modal
          title={editing.id ? '编辑负债' : '新增负债'}
          onClose={() => setEditing(null)}
          footer={
            <>
              {editing.id && (
                <button onClick={() => setConfirmDel(true)} className="btn-ghost text-red-500 mr-auto">
                  删除
                </button>
              )}
              <button onClick={() => setEditing(null)} className="btn-ghost">
                取消
              </button>
              <button onClick={save} className="btn-primary">
                保存
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">名称</label>
                <input
                  className="input"
                  value={editing.name ?? ''}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="如：车贷"
                />
              </div>
              <div>
                <label className="label">图标</label>
                <div className="flex gap-1 flex-wrap">
                  {LIAB_ICONS.map((ic) => (
                    <button
                      key={ic}
                      onClick={() => setEditing({ ...editing, icon: ic })}
                      className={`w-9 h-9 rounded-lg text-lg ${editing.icon === ic ? '' : 'bg-card-2'}`}
                      style={editing.icon === ic ? { boxShadow: '0 0 0 2px var(--accent)' } : undefined}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">贷款本金（初始）</label>
                <input
                  type="number"
                  className="input"
                  value={editing.balance ?? 0}
                  onChange={(e) => setEditing({ ...editing, balance: Number(e.target.value) })}
                />
                {editing?.id && (
                  <p className="text-xs text-faint mt-1">
                    已还 {fmtMoney(repaidForEdit, 'CNY')} · 当前待还 {fmtMoney(editingCurrent, 'CNY')}
                  </p>
                )}
              </div>
              <div>
                <label className="label">月供</label>
                <input
                  type="number"
                  className="input"
                  value={editing.monthly_payment ?? ''}
                  onChange={(e) =>
                    setEditing({ ...editing, monthly_payment: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="label">剩余期数</label>
                <input
                  type="number"
                  className="input"
                  value={editing.remaining_terms ?? ''}
                  onChange={(e) =>
                    setEditing({ ...editing, remaining_terms: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <div>
              <label className="label">备注</label>
              <input
                className="input"
                value={editing.note ?? ''}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                placeholder="如：汽车金融"
              />
            </div>
          </div>
        </Modal>
      )}
      <ConfirmDialog
        open={confirmDel}
        title="删除负债"
        danger
        message={`确定删除「${editing?.name ?? ''}」吗？已还记录将不再冲减此负债，操作不可撤销。`}
        confirmText="确认删除"
        onConfirm={onDeleteConfirm}
        onCancel={() => setConfirmDel(false)}
      />
    </SubPage>
  )
}

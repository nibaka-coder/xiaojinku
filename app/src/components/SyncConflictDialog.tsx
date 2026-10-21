import { useMemo } from 'react'
import Modal from '@/components/Modal'
import { fmtMoney } from '@/lib/money'

function agoText(iso?: string | null): string {
  if (!iso) return '未知时间'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '未知时间'
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  if (mins < 60 * 24) return `${Math.floor(mins / 60)} 小时前`
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function summarize(data: any) {
  const txns: any[] = data?.transactions ?? []
  const expense = txns
    .filter((t) => t.type === 'expense' && !t.is_repayment && !t.is_investment_transfer)
    .reduce((s, t) => s + (t.amount || 0), 0)
  return {
    txnCount: txns.length,
    secCount: (data?.securities ?? []).length,
    expense,
  }
}

// 冲突裁决：绝不静默覆盖，必须由用户二选一
export default function SyncConflictDialog({
  open,
  remote,
  busy,
  onUseRemote,
  onUseLocal,
  onCancel,
}: {
  open: boolean
  remote: any
  busy: boolean
  onUseRemote: () => void
  onUseLocal: () => void
  onCancel: () => void
}) {
  const info = useMemo(() => summarize(remote?.data), [remote])
  const remoteAt = remote?.updatedAt
  return (
    <Modal open={open} title="数据冲突" onClose={onCancel}>
      <div className="space-y-3">
        <p className="text-sm text-sub">
          服务器上的数据比你这台设备已同步的版本更新。为避免丢失记录，请选择一个版本保留：
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="card-2 p-3">
            <div className="text-xs text-faint">服务器版本</div>
            <div className="text-sm font-medium text-main">
              {info.txnCount} 笔流水 · {info.secCount} 只证券
            </div>
            <div className="text-xs text-faint">
              支出 {fmtMoney(info.expense, 'CNY')} · {agoText(remoteAt)}
            </div>
          </div>
          <div className="card-2 p-3">
            <div className="text-xs text-faint">本设备版本</div>
            <div className="text-sm font-medium text-main">当前正在使用的账本</div>
            <div className="text-xs text-faint">你刚才在这台设备上的改动</div>
          </div>
        </div>
        <div className="text-xs" style={{ color: 'var(--danger)' }}>
          ⚠️ 选择后未被选中的一方数据将被覆盖，此操作不可撤销。建议先各导出一份备份。
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button className="btn-ghost flex-1" onClick={onCancel} disabled={busy}>
          稍后处理
        </button>
        <button className="btn-danger flex-1" onClick={onUseRemote} disabled={busy}>
          用服务器的
        </button>
        <button className="btn-primary flex-1" onClick={onUseLocal} disabled={busy}>
          保留我的
        </button>
      </div>
    </Modal>
  )
}

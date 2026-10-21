import { useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { Category } from '@/types'
import Modal from '@/components/Modal'

const ICON_OPTIONS = ['🍜', '🚌', '🛍️', '🏠', '🎮', '💊', '📦', '💰', '📈', '✨', '☕', '🍺', '✈️', '🎁', '📱', '⛽', '🐱', '📚']

function blank(type: 'expense' | 'income'): Partial<Category> {
  return { name: '', type, icon: '📦', color: '#5fa896', is_system: false }
}

export default function Categories() {
  const categories = useStore((s) => s.categories)
  const addCategory = useStore((s) => s.addCategory)
  const updateCategory = useStore((s) => s.updateCategory)
  const deleteCategory = useStore((s) => s.deleteCategory)

  const [tab, setTab] = useState<'expense' | 'income'>('expense')
  const [editing, setEditing] = useState<Partial<Category> | null>(null)

  const list = useMemo(
    () => categories.filter((c) => c.type === tab).sort((a, b) => a.order - b.order),
    [categories, tab]
  )

  const save = () => {
    if (!editing || !editing.name?.trim()) return
    const data = {
      name: editing.name.trim(),
      type: editing.type as 'expense' | 'income',
      icon: editing.icon ?? '📦',
      color: editing.color ?? '#5fa896',
      is_system: editing.is_system ?? false,
    }
    if (editing.id) updateCategory({ id: editing.id, ...data })
    else addCategory(data as any)
    setEditing(null)
  }

  const [confirmDel, setConfirmDel] = useState(false)
  const onDelete = () => {
    if (editing?.id) {
      deleteCategory(editing.id)
      setEditing(null)
      setConfirmDel(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="seg">
          {(['expense', 'income'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`seg-item ${tab === t ? 'seg-item-active' : ''}`}
            >
              {t === 'expense' ? '支出分类' : '收入分类'}
            </button>
          ))}
        </div>
        <button
          className="text-sm font-medium"
          style={{ color: 'var(--accent-strong)' }}
          onClick={() => setEditing(blank(tab))}
        >
          ＋ 新增
        </button>
      </div>

      <div className="space-y-2">
        {list.map((c) => (
            <button
              key={c.id}
              onClick={() => setEditing({ ...c })}
              className="card-2 w-full text-left flex items-center gap-3 active:bg-[var(--border)]"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0"
                style={{ backgroundColor: c.color + '22' }}
              >
                {c.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-main">{c.name}</div>
                <div className="text-xs text-faint">
                  {c.is_system ? '系统分类' : '自定义'}
                </div>
              </div>
            </button>
        ))}
        {list.length === 0 && <p className="text-sm text-faint">暂无分类</p>}
      </div>

      {editing && (
        <Modal
          title={editing.id ? '编辑分类' : '新增分类'}
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
            <div>
              <label className="label">名称</label>
              <input
                className="input"
                value={editing.name ?? ''}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="如：餐饮"
              />
            </div>
            <div>
              <label className="label">图标</label>
              <div className="grid grid-cols-6 gap-1.5">
                {ICON_OPTIONS.map((ic) => (
                  <button
                    key={ic}
                    onClick={() => setEditing({ ...editing, icon: ic })}
                    className={`h-10 rounded-lg text-lg ${
                      editing.icon === ic ? 'ring-2 ring-offset-1' : 'bg-card-2'
                    }`}
                    style={editing.icon === ic ? { boxShadow: '0 0 0 2px var(--accent)' } : undefined}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">颜色</label>
                <input
                  type="color"
                  className="input h-10 p-1"
                  value={editing.color ?? '#5fa896'}
                  onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                />
              </div>
            </div>
          </div>
        </Modal>
      )}
      <ConfirmDialog
        open={confirmDel}
        title="删除分类"
        danger
        message={`确定删除「${editing?.name ?? ''}」吗？相关交易将变为「未分类」，操作不可撤销。`}
        confirmText="确认删除"
        onConfirm={onDelete}
        onCancel={() => setConfirmDel(false)}
      />
    </div>
  )
}

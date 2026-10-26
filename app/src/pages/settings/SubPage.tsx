import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

// 设置子页的统一外壳：左上角返回设置首页 + 标题
export default function SubPage({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button className="btn-ghost text-sm shrink-0" onClick={() => navigate('/settings')}>
          ‹ 设置
        </button>
        <h1 className="text-lg font-semibold text-main truncate">{title}</h1>
      </div>
      {children}
    </div>
  )
}

export function Row({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sub">{label}</span>
      <span className="font-semibold" style={{ color: valueColor ?? 'var(--text)' }}>
        {value}
      </span>
    </div>
  )
}

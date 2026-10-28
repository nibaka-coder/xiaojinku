/**
 * 加载占位骨架屏。
 * 微光扫动只做 transform 动画（见 index.css 的 skeleton-sweep），不触发布局；
 * 系统开启「减弱动效」时自动停止（prefers-reduced-motion）。
 */
export default function Skeleton({
  rows = 3,
  withTrailing = true,
}: {
  rows?: number
  /** 是否在右侧占位一列（用于金额/数值列） */
  withTrailing?: boolean
}) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 10 }} />
          <div className="flex-1 space-y-2">
            <div className="skeleton" style={{ height: 12, width: `${70 - i * 5}%` }} />
            <div className="skeleton" style={{ height: 10, width: `${44 - i * 3}%` }} />
          </div>
          {withTrailing && <div className="skeleton" style={{ height: 12, width: 56 }} />}
        </div>
      ))}
    </div>
  )
}

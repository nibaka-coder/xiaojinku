export default function EmptyState({
  icon = '🌱',
  title,
  desc,
  actionText,
  onAction,
}: {
  icon?: string
  title: string
  desc?: string
  actionText?: string
  onAction?: () => void
}) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="empty-title">{title}</div>
      {desc && <div className="empty-desc">{desc}</div>}
      {actionText && onAction && (
        <button className="btn btn-primary mt-1" onClick={onAction}>
          {actionText}
        </button>
      )}
    </div>
  )
}

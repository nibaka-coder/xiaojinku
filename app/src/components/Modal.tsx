import type { ReactNode } from 'react'

export default function Modal({
  open = true,
  title,
  onClose,
  children,
  footer,
}: {
  open?: boolean
  title?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-soft sticky top-0 bg-card">
            <h3 className="font-semibold">{title}</h3>
            <button onClick={onClose} className="text-slate-400 text-2xl leading-none">
              ×
            </button>
          </div>
        )}
        <div className="p-4">{children}</div>
        {footer && (
          <div className="px-4 py-3 border-t border-slate-100 flex gap-2 justify-end">{footer}</div>
        )}
      </div>
    </div>
  )
}

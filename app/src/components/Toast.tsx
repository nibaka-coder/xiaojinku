import { useEffect } from 'react'

export type ToastTone = 'default' | 'success' | 'warn' | 'error'

/**
 * 轻提示。定位在底部 Tab 之上，默认 3 秒自动关闭。
 * 支持一个行动按钮（如「撤销」），点了先执行动作再关闭。
 */
export default function Toast({
  open,
  message,
  tone = 'default',
  actionText,
  onAction,
  onClose,
  duration = 3000,
}: {
  open: boolean
  message: string
  tone?: ToastTone
  actionText?: string
  onAction?: () => void
  onClose?: () => void
  duration?: number
}) {
  useEffect(() => {
    if (!open || !onClose) return
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [open, duration, onClose])

  if (!open) return null

  const toneCls = tone === 'default' ? '' : ` toast-${tone}`

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pointer-events-none"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
    >
      <div className={`toast${toneCls} pointer-events-auto`} role="status" aria-live="polite">
        <span>{message}</span>
        {actionText && onAction && (
          <button
            className="toast-action"
            onClick={() => {
              onAction()
              onClose?.()
            }}
          >
            {actionText}
          </button>
        )}
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'
import Modal from './Modal'

export default function ConfirmDialog({
  open,
  title = '确认操作',
  message,
  confirmText = '确认',
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title?: string
  message: ReactNode
  confirmText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn-ghost flex-1" onClick={onCancel}>
            取消
          </button>
          <button
            className={danger ? 'btn-danger flex-1' : 'btn-primary flex-1'}
            onClick={() => {
              onConfirm()
              onCancel()
            }}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <p className="text-sm" style={{ color: 'var(--text-sub)' }}>
        {message}
      </p>
    </Modal>
  )
}

import { useState } from 'react'
import { useStore } from '@/store/useStore'
import ConfirmDialog from '@/components/ConfirmDialog'
import SubPage from './SubPage'

export default function Lock() {
  const appLockEnabled = useStore((s) => s.settings.appLockEnabled)
  const setPin = useStore((s) => s.setPin)
  const disableLock = useStore((s) => s.disableLock)
  const [pin, setPinInput] = useState('')
  const [pin2, setPin2] = useState('')
  const [err, setErr] = useState('')
  const [confirmLock, setConfirmLock] = useState(false)

  const enable = () => {
    if (pin.length < 4) return setErr('PIN 至少 4 位')
    if (pin !== pin2) return setErr('两次输入不一致')
    setPin(pin)
    setPinInput('')
    setPin2('')
    setErr('')
  }

  return (
    <SubPage title="应用锁">
      <section className="card space-y-3">
        {appLockEnabled ? (
          <>
            <p className="text-sm" style={{ color: 'var(--income-text)' }}>
              已启用 PIN 保护
            </p>
            <button className="btn-outline w-full" onClick={() => setConfirmLock(true)}>
              关闭应用锁
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <input
              type="password"
              inputMode="numeric"
              className="input"
              placeholder="设置 PIN（至少 4 位）"
              value={pin}
              onChange={(e) => {
                setPinInput(e.target.value)
                setErr('')
              }}
            />
            <input
              type="password"
              inputMode="numeric"
              className="input"
              placeholder="再次输入 PIN"
              value={pin2}
              onChange={(e) => setPin2(e.target.value)}
            />
            {err && (
              <p className="text-xs" style={{ color: 'var(--danger-text)' }}>
                {err}
              </p>
            )}
            <button className="btn-primary w-full" onClick={enable}>
              启用应用锁
            </button>
          </div>
        )}
        <p className="text-xs text-faint">
          注意：当前为演示用弱哈希，仅防随手查看，并非强加密。
        </p>
      </section>

      <ConfirmDialog
        open={confirmLock}
        title="关闭应用锁"
        danger
        message="关闭应用锁后，数据将不再受 PIN 保护，确定关闭吗？"
        confirmText="确认关闭"
        onConfirm={disableLock}
        onCancel={() => setConfirmLock(false)}
      />
    </SubPage>
  )
}

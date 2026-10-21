import { useState } from 'react'
import { useStore } from '@/store/useStore'

export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const verify = useStore((s) => s.verifyPin)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')

  const submit = () => {
    if (verify(pin)) onUnlock()
    else {
      setErr('PIN 错误')
      setPin('')
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-brand-700">
      <div className="w-full max-w-xs bg-white rounded-2xl p-6 shadow-xl">
        <div className="text-center mb-4">
          <div className="text-3xl">🔒</div>
          <h2 className="font-semibold mt-2">小金库已锁定</h2>
          <p className="text-xs text-slate-400">请输入 PIN 解锁</p>
        </div>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value)
            setErr('')
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="PIN"
          className="input text-center tracking-[0.5em] text-lg"
        />
        {err && <p className="text-red-500 text-xs mt-2 text-center">{err}</p>}
        <button onClick={submit} className="btn-primary w-full mt-4">
          解锁
        </button>
      </div>
    </div>
  )
}

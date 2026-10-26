import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { fetchFxRates } from '@/lib/quoteService'
import SubPage from './SubPage'

export default function Fx() {
  const fxRate = useStore((s) => s.settings.fxRate)
  const hkdRate = useStore((s) => s.settings.hkdRate)
  const setFxRate = useStore((s) => s.setFxRate)
  const setHkdRate = useStore((s) => s.setHkdRate)
  const [usdInput, setUsdInput] = useState(String(fxRate.rate))
  const [hkdInput, setHkdInput] = useState(String(hkdRate.rate))
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const updateUsd = () => {
    const r = parseFloat(usdInput)
    if (!r || r <= 0) return setMsg('请输入有效汇率')
    setFxRate(r, true)
    setMsg('USD 汇率已更新（手动）')
  }
  const updateHkd = () => {
    const r = parseFloat(hkdInput)
    if (!r || r <= 0) return setMsg('请输入有效汇率')
    setHkdRate(r, true)
    setMsg('HKD 汇率已更新（手动）')
  }
  const fetchFx = async () => {
    setBusy(true)
    setMsg('获取中…')
    try {
      const fx = await fetchFxRates()
      if (fx && fx.usdRate > 0 && fx.hkdRate > 0) {
        setFxRate(fx.usdRate, false)
        setHkdRate(fx.hkdRate, false)
        setUsdInput(String(fx.usdRate))
        setHkdInput(String(fx.hkdRate))
        setMsg(`已自动获取：USD ${fx.usdRate} · HKD ${fx.hkdRate}`)
      } else {
        setMsg('未获取到汇率，可手动填写')
      }
    } catch {
      setMsg('获取失败（可手动填写）')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SubPage title="汇率">
      <section className="card space-y-3">
        <div>
          <div className="flex items-center gap-2 text-sm mb-1">
            <span className="text-sub">USD 当前</span>
            <span className="font-semibold text-main">¥{fxRate.rate} / $1</span>
            <span className="text-xs text-faint">
              {fxRate.manual ? '手动' : '自动'} · {fxRate.updated_at.slice(0, 10)}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.0001"
              className="input"
              value={usdInput}
              onChange={(e) => setUsdInput(e.target.value)}
              placeholder="USD→CNY"
            />
            <button className="btn-primary" onClick={updateUsd}>
              更新
            </button>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 text-sm mb-1">
            <span className="text-sub">HKD 当前</span>
            <span className="font-semibold text-main">¥{hkdRate.rate} / HK$1</span>
            <span className="text-xs text-faint">
              {hkdRate.manual ? '手动' : '自动'} · {hkdRate.updated_at.slice(0, 10)}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.0001"
              className="input"
              value={hkdInput}
              onChange={(e) => setHkdInput(e.target.value)}
              placeholder="HKD→CNY"
            />
            <button className="btn-primary" onClick={updateHkd}>
              更新
            </button>
          </div>
        </div>
        <button className="btn-outline w-full" onClick={fetchFx} disabled={busy}>
          {busy ? '获取中…' : '↻ 刷新汇率'}
        </button>
        <p className="text-xs text-faint">
          提示：在「持仓总览」点击「↻ 刷新行情」也会一并刷新汇率。
        </p>
        {msg && <p className="text-xs text-faint">{msg}</p>}
      </section>
    </SubPage>
  )
}

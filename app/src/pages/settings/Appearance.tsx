import { useStore } from '@/store/useStore'
import { Glyph } from '@/components/Icon'
import SubPage from './SubPage'
import type { ThemeMode } from '@/types'

export default function Appearance() {
  const theme = useStore((s) => s.settings.theme)
  const setTheme = useStore((s) => s.setTheme)

  return (
    <SubPage title="外观">
      <section className="card space-y-3">
        <div className="seg w-full">
          {(
            [
              ['light', '浅色', 'sun'],
              ['dark', '深色', 'moon'],
              ['system', '跟随系统', 'smartphone'],
            ] as [ThemeMode, string, string][]
          ).map(([m, label, icon]) => (
            <button
              key={m}
              onClick={() => setTheme(m)}
              className={`seg-item flex-1 flex items-center justify-center gap-1 ${theme === m ? 'seg-item-active' : ''}`}
            >
              <Glyph value={icon} size={15} /> {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-faint">
          「跟随系统」会随手机 / 电脑的深浅色设置自动切换。
        </p>
      </section>
    </SubPage>
  )
}

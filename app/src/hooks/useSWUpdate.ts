import { useCallback, useEffect, useState } from 'react'

// 监听 Service Worker 的「发现新版本」。
//
// 页面现在是「先用缓存秒开、后台偷偷下载新版」，所以新版要刷新才生效。
// 检测方式有两路，任一命中都会显示提示条：
//   1. SW 主动 postMessage（快，但可能早于页面 JS 挂载，会漏）
//   2. 读 Cache Storage 里的标记 sw-update-flag（兜底，启动时 + 页面重新可见时各读一次）
const FLAG = './sw-update-flag'

// 当前页面自己的构建版本号（每次 npm run build 都不同）
function myBuildId(): string {
  if (typeof document === 'undefined') return ''
  return document.querySelector('meta[name="xjk-build"]')?.getAttribute('content') ?? ''
}

// 标记存在、且标记里的构建号 ≠ 当前页面的构建号 → 才说明「有新版待生效」。
// 反之（两者相同）说明当前页面已经是新版，标记是上一轮遗留的，直接清掉。
async function hasNewerVersion(): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return false
    const mine = myBuildId()
    const keys = await caches.keys()
    for (const k of keys) {
      if (!k.startsWith('xiaojinku-')) continue
      const c = await caches.open(k)
      const hit = await c.match(FLAG)
      if (!hit) continue
      const val = (await hit.text()).trim()
      if (!mine || !val || val !== mine) return true
      // 已经是新版：清掉遗留标记
      await c.delete(FLAG)
      return false
    }
  } catch {
    /* 读不到就当作没有新版本 */
  }
  return false
}

async function clearFlag() {
  try {
    if (typeof caches === 'undefined') return
    const keys = await caches.keys()
    for (const k of keys) {
      if (!k.startsWith('xiaojinku-')) continue
      const c = await caches.open(k)
      await c.delete(FLAG)
    }
  } catch {
    /* 清不掉不影响使用，最多下次再提示一次 */
  }
}

export function useSWUpdate() {
  const [hasUpdate, setHasUpdate] = useState(false)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    let alive = true

    const onMsg = (e: MessageEvent) => {
      if (e && e.data && e.data.type === 'SW_UPDATED') setHasUpdate(true)
    }
    navigator.serviceWorker.addEventListener('message', onMsg)

    const check = async () => {
      if (await hasNewerVersion()) {
        if (alive) setHasUpdate(true)
        return
      }
      // 标记没有也问一下 SW（SW 可能刚写完标记还没落盘）
      try {
        const reg = await navigator.serviceWorker.getRegistration()
        reg?.active?.postMessage({ type: 'QUERY_UPDATE' })
      } catch {
        /* 忽略 */
      }
    }
    check()
    // 手机切后台再回来时也查一次
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      alive = false
      navigator.serviceWorker.removeEventListener('message', onMsg)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const applyUpdate = useCallback(() => {
    // 让等待中的 SW 立即接管，再刷新页面
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => {
          reg?.waiting?.postMessage({ type: 'SKIP_WAITING' })
        })
        .catch(() => undefined)
    }
    setTimeout(() => window.location.reload(), 150)
  }, [])

  // 忽略 = 本次不刷新（下次打开自动是新版本），并清掉标记避免每次都弹
  const dismiss = useCallback(() => {
    setHasUpdate(false)
    clearFlag()
  }, [])

  return { hasUpdate, applyUpdate, dismiss }
}

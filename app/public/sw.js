// 小金库 · Service Worker
// 目的有两个：
//   1. 秒开：打开时直接用缓存渲染，不等网络（网络慢时不再白屏等待）
//   2. 断网时也能打开账本（记账数据本身存在 IndexedDB，与本文件无关）
//
// 四条硬性边界（改动时请保留）：
//   1. 只处理 GET 请求
//   2. 不处理跨域请求（行情接口走这里会被缓存，后果严重）
//   3. 不处理 /sync/ 路径（同源的云同步接口，绝不能缓存，否则数据永远拉不到新的）
//   4. 本文件自身必须 no-cache 部署（服务器已配置）；否则新版 SW 要等 CDN 过期才生效
//
// 「发现新版本」的传递方式：写标记到 Cache Storage（FLAG），而不是只靠 postMessage。
// 原因：后台更新常在页面 JS 挂载之前就完成，那时 postMessage 无人接收；
// 页面就绪后主动读一次标记，保证提示不丢。

const CACHE = 'xiaojinku-v2'
const FLAG = './sw-update-flag'
const SHELL = ['./index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png']

// 从页面 HTML 里取出构建版本号，用于判断「用户当前跑的是不是已经是最新版」
function buildIdOf(text) {
  const m = text && text.match(/<meta name="xjk-build" content="([^"]+)"/)
  return m ? m[1] : ''
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // 逐个缓存并容错：任一资源缺失都不会导致整个安装失败
      .then((cache) => Promise.all(SHELL.map((u) => cache.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// 页面收到这个消息后显示「发现新版本 · 刷新」（即时通知；标记 FLAG 是兜底，保证不丢）
let pendingUpdate = false
async function notifyUpdate() {
  pendingUpdate = true
  try {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of list) c.postMessage({ type: 'SW_UPDATED' })
  } catch {
    /* 通知失败不影响缓存已更新 */
  }
}

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'SKIP_WAITING') self.skipWaiting()
  if (data.type === 'QUERY_UPDATE' && pendingUpdate && event.source) {
    event.source.postMessage({ type: 'SW_UPDATED' })
  }
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.indexOf('/sync/') === 0) return
  if (url.pathname.indexOf('/sw-update-flag') >= 0) return

  // 页面导航：stale-while-revalidate
  //   有缓存 → 立即返回（秒开），后台拉取新版；内容真的变了才写标记 + 通知页面。
  //   无缓存（首次安装）→ 必须等网络，拿不到才回落到 ./ 或缓存。
  if (req.mode === 'navigate') {
    // 注意：waitUntil 必须在事件派发期内同步调用，否则后台更新会被丢弃
    const updated = (async () => {
      const cache = await caches.open(CACHE)
      const cached = await cache.match('./index.html')
      if (!cached) {
        try {
          const res = await fetch(req)
          if (res && res.ok) await cache.put('./index.html', res.clone())
          return { res }
        } catch {
          return { res: null }
        }
      }
      try {
        const res = await fetch(req)
        if (!res || !res.ok) return { cached }
        const [oldText, newText] = await Promise.all([cached.clone().text(), res.clone().text()])
        if (oldText === newText) {
          // 内容没变：清掉旧标记 + 复位通知标志（说明上次的更新用户已经用上了）
          pendingUpdate = false
          await cache.delete(FLAG)
          return { cached }
        }
        await cache.put('./index.html', res.clone())
        // 标记值 = 新版构建号；页面拿它跟自己的构建号比，相同就说明已经用上新版了
        await cache.put(FLAG, new Response(buildIdOf(newText) || String(Date.now())))
        notifyUpdate()
        return { cached }
      } catch {
        return { cached }
      }
    })()
    event.waitUntil(updated)
    event.respondWith(
      updated.then(async ({ res, cached }) => {
        if (res) return res
        if (cached) return cached
        const cache = await caches.open(CACHE)
        const fallback = await cache.match('./')
        return fallback || new Response('离线，且本地暂无缓存', { status: 503 })
      })
    )
    return
  }

  // 静态资源：缓存优先，后台顺带更新
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => hit)
      return hit || network
    })
  )
})

// 小金库 · Service Worker
// 目的只有一个：断网时也能打开账本。所有记账数据本身存在 IndexedDB，与本文件无关。
// 三条硬性边界（改动时请保留）：
//   1. 只处理 GET 请求
//   2. 不处理跨域请求（行情接口、云同步接口走这里会被缓存，后果严重）
//   3. 不处理 /sync/ 路径（与本应用同源的云同步接口，绝不能缓存，否则数据永远拉不到新的）

const CACHE = 'xiaojinku-v1'
const SHELL = ['./index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png']

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

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.indexOf('/sync/') === 0) return

  // 页面导航：优先走网络，保证部署新版本后能拿到最新页面；断网才回落缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put('./index.html', copy))
          }
          return res
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./')))
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

// 验证 v2.26 的两项性能改动：
//   A) Service Worker 改 stale-while-revalidate → 二次打开走缓存、后台更新、内容变了弹「发现新版本」
//   B) 单文件体积瘦身（echarts 按需引入）→ 传输量显著下降
// 真渲染：无头 Chrome + 本地静态服务（localhost 视为 secure context，可注册 SW）
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import os from 'node:os'
import puppeteer from 'puppeteer-core'

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ''}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`)
  }
}

const root = path.resolve('dist')
const MIME = {
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

// 服务端的 index.html 内容：第 3 次及以后返回「新版」（插入标记），用于验证后台更新能发现变化
let version = 'A'
const origHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
// 模拟「部署了新版」：插注释标记 + 换掉构建版本号（后者才是 SW 判断新旧的依据）
const mkHtml = (v) =>
  v === 'A'
    ? origHtml
    : origHtml
        .replace('<title>', `<!-- v${v} --><title>`)
        .replace(/(<meta name="xjk-build" content=")[^"]+(")/, '$1build-B$2')

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/' || p === '/index.html') {
    const body = mkHtml(version)
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    })
    res.end(body)
    return
  }
  const f = path.join(root, p === '/sw.js' ? 'sw.js' : p)
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404)
    res.end('404')
    return
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  })
  res.end(fs.readFileSync(f))
})

const port = 8123
await new Promise((r) => server.listen(port, r))
const base = `http://localhost:${port}/`

const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const errors = []
// 调试：抓取 Service Worker 自己的 console 输出
try {
  const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker', { timeout: 8000 })
  const sw = await swTarget.worker()
  sw.on('console', (m) => console.log('  [SW]', m.text()))
  sw.on('pageerror', (e) => console.log('  [SW-ERR]', String(e)))
} catch (e) {
  console.log('  (未捕获 SW target)', String(e).slice(0, 60))
}
const page = await browser.newPage()
page.on('pageerror', (e) => errors.push(String(e)))

const open = async () => {
  await page.goto(base + '?t=' + Date.now(), { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 1200))
}
const rootHtml = () => page.evaluate(() => document.getElementById('root')?.innerHTML.length ?? 0)
const bodyText = () => page.evaluate(() => document.body.innerText)

console.log('=== 1) 首次打开（无缓存，必须联网）===')
await open()
ok('首次渲染非白屏', (await rootHtml()) > 0)
const swReady = await page.evaluate(() =>
  navigator.serviceWorker.getRegistration().then((r) => !!r)
)
ok('Service Worker 已注册', swReady)

console.log('\n=== 2) 二次打开（走缓存，应立即渲染）===')
const t0 = Date.now()
await open()
const dt = Date.now() - t0
ok('二次渲染非白屏', (await rootHtml()) > 0)
ok(`二次打开耗时 ${dt}ms 明显快于联网首屏`, dt < 2500, `${dt}ms`)
ok('未误报「发现新版本」（内容未变）', !(await bodyText()).includes('发现新版本'))

console.log('\n=== 3) 服务器内容更新后：后台发现并提示 ===')
version = 'B'
await open() // 这次命中旧缓存 + 后台拉取 B
await new Promise((r) => setTimeout(r, 1500))
const txt3 = await bodyText()
// 诊断：后台更新到底有没有把新版写进缓存
const cacheHasB = await page.evaluate(async () => {
  try {
    const c = await caches.open('xiaojinku-v2')
    const r = await c.match('./index.html')
    if (!r) return 'no-entry'
    const t = await r.text()
    return t.includes('<!-- vB -->') ? 'has-B' : 'still-A'
  } catch (e) {
    return 'err:' + String(e)
  }
})
ok('后台更新已把新版写入缓存', cacheHasB === 'has-B', `缓存状态 = ${cacheHasB}`)
ok('内容真的变了 → 弹出「发现新版本」', txt3.includes('发现新版本'), txt3.slice(0, 60).replace(/\n/g, ' | '))
ok('提示条有「刷新」按钮', txt3.includes('刷新'))

console.log('\n=== 4) 点刷新后即用到新版 ===')
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '刷新')
  if (b) b.click()
})
await new Promise((r) => setTimeout(r, 2500))
const html4 = await page.evaluate(() => document.documentElement.innerHTML)
ok('刷新后加载的是新版（含 vB 标记）', html4.includes('<!-- vB -->'))
ok('刷新后提示条消失', !(await bodyText()).includes('发现新版本'))
ok('刷新后仍非白屏', (await rootHtml()) > 0)

ok('全程无 pageerror', errors.length === 0, errors.join(' | '))

console.log('\n=== 5) 体积（echarts 按需引入后）===')
const raw = fs.statSync(path.join(root, 'index.html')).size
const zlib = await import('node:zlib')
const br = zlib.brotliCompressSync(fs.readFileSync(path.join(root, 'index.html'))).length
console.log(`  单文件 ${(raw / 1024).toFixed(0)} KB，brotli 后 ${(br / 1024).toFixed(0)} KB`)
ok('brotli 后传输量 < 300KB（原 445KB）', br < 300 * 1024, `${(br / 1024).toFixed(0)}KB`)

await browser.close()
server.close()
console.log(`\n结果: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

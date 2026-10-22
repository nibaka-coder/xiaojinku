// 验证 PWA 三件套：页面能渲染 + manifest 可加载 + Service Worker 注册成功 + 图标可达
// 运行前先 npm run build，并确保 8099 端口的静态服务已启动（node serve_spa.mjs）
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE || 'http://127.0.0.1:8099/'
const CHROME =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

let pass = 0
let fail = 0
function check(name, ok, extra = '') {
  if (ok) {
    pass++
    console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`)
  } else {
    fail++
    console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`)
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 })
  await new Promise((r) => setTimeout(r, 2500)) // 等 SW 注册

  console.log('\n[1] 页面渲染')
  const rootLen = await page.evaluate(
    () => (document.getElementById('root')?.innerHTML || '').length
  )
  check('应用挂载成功', rootLen > 0, `root 内 HTML ${rootLen} 字符`)

  console.log('\n[2] manifest 与图标')
  const manifestHref = await page.evaluate(
    () => document.querySelector('link[rel="manifest"]')?.getAttribute('href') || ''
  )
  check('manifest 已声明', !!manifestHref, manifestHref)

  const m = await page.evaluate(async (href) => {
    const r = await fetch(href)
    return { status: r.status, json: await r.json().catch(() => null) }
  }, manifestHref)
  check('manifest 可访问', m.status === 200, `HTTP ${m.status}`)
  check('应用名正确', m.json?.name === '小金库', m.json?.name || '(空)')
  check('含 192/512 图标', (m.json?.icons || []).length >= 2, `${(m.json?.icons || []).length} 个`)
  check(
    '含 maskable 图标',
    (m.json?.icons || []).some((i) => i.purpose === 'maskable'),
    ''
  )

  for (const p of ['./icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png']) {
    const st = await page.evaluate(async (u) => (await fetch(u)).status, p)
    check(`图标 ${p}`, st === 200, `HTTP ${st}`)
  }

  console.log('\n[3] Service Worker')
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false }
    const reg = await navigator.serviceWorker.getRegistration()
    return { supported: true, registered: !!reg, scope: reg?.scope || '' }
  })
  check('浏览器支持 SW', sw.supported)
  check('SW 注册成功', !!sw.registered, sw.scope)

  console.log('\n[4] 持久化存储申请')
  const persisted = await page.evaluate(async () => {
    if (navigator.storage?.persisted) return await navigator.storage.persisted()
    return null
  })
  console.log(`  INFO  navigator.storage.persisted() = ${persisted}`)

  console.log('\n[5] 控制台错误')
  check('无 pageerror', errors.length === 0, errors.slice(0, 3).join(' | '))

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
} finally {
  await browser.close()
}

process.exit(fail === 0 ? 0 : 1)

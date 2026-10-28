import puppeteer from 'puppeteer-core'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * 数据安全回归（对应 design/数据安全改进方案v1.md 第 6 节）
 *
 * T1 备份文件不含同步令牌 / PIN 哈希
 * T2 同步请求载荷不含同步令牌 / PIN 哈希
 * T3 导入不改变本机同步凭证与锁屏凭据
 * T4 并发冲突不静默覆盖（T4a/b/c 客户端收到 409 时本地不被覆盖；T4d/e 并发契约用 Node 模拟锁验证）
 * T5 损坏/异常数据文件不被当成空账本覆盖本地
 *
 * ⚠️ 说明：沙箱无 PHP，本脚本用的是「与 api.php 契约一致」的 Node 模拟服务端。
 *    真实 PHP 环境下的 flock 并发验证（T4b-php）需人工在服务器执行，见交付文档。
 */

const root = path.resolve('dist')
const FILE = 'index.html'
const TOKEN = 'SEC_TOKEN_9f3a2b7c4d'
const FORGED_TOKEN = 'STOLEN_TOKEN_XYZ'

let serverState = { version: 0, updatedAt: null, data: null }
let lastPostRaw = ''
let corruptMode = false
let criticalDelay = 0

// 模拟服务端互斥锁（对应 api.php 的 flock），用于验证「读-判-写」串行化
let locked = false
const acquireLock = () =>
  new Promise((resolve) => {
    const tryIt = () => {
      if (!locked) {
        locked = true
        resolve()
      } else setTimeout(tryIt, 5)
    }
    tryIt()
  })
const releaseLock = () => {
  locked = false
}

const DEVICE_KEYS = ['appLockEnabled', 'pinHash', 'theme', 'sync', 'lastBackupAt', 'dividendScanAt']

const httpServer = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0]
  const send = (code, obj) => {
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Token',
    })
    res.end(JSON.stringify(obj))
  }
  if (url === '/api.php') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Token',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      })
      res.end()
      return
    }
    if ((req.headers['x-sync-token'] || '') !== TOKEN) {
      return send(401, { ok: false, error: 'unauthorized' })
    }
    if (req.method === 'GET') {
      if (corruptMode) return send(500, { ok: false, error: 'data file corrupt' })
      return send(200, {
        ok: true,
        version: serverState.version,
        updatedAt: serverState.updatedAt,
        data: serverState.data,
      })
    }
    if (req.method === 'POST') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', async () => {
        lastPostRaw = body
        const j = JSON.parse(body || '{}')
        const base = Number(j.baseVersion || 0)
        if (corruptMode && !j.force) {
          return send(500, { ok: false, error: 'data file corrupt' })
        }
        await acquireLock()
        // 临界区内的人为延迟，放大并发窗口（对应真实环境读-判-写的耗时）
        if (criticalDelay) await new Promise((r) => setTimeout(r, criticalDelay))
        if (!j.force && serverState.version > base && serverState.data) {
          releaseLock()
          return send(409, {
            ok: false,
            conflict: true,
            version: serverState.version,
            updatedAt: serverState.updatedAt,
            data: serverState.data,
          })
        }
        serverState = {
          version: Math.max(serverState.version, base) + 1,
          updatedAt: new Date().toISOString(),
          data: j.data,
        }
        releaseLock()
        return send(200, { ok: true, version: serverState.version, updatedAt: serverState.updatedAt })
      })
      return
    }
  }
  if ((req.url || '').includes('favicon')) {
    res.writeHead(204)
    res.end()
    return
  }
  const f = path.join(root, url === '/' ? 'index.html' : decodeURIComponent(url))
  fs.readFile(f, (e, buf) => {
    if (e) {
      res.writeHead(404)
      res.end('nf')
      return
    }
    const MIME = {
      '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
      '.json': 'application/json', '.webmanifest': 'application/manifest+json',
      '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css',
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' })
    res.end(buf)
  })
})
await new Promise((r) => httpServer.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${httpServer.address().port}/`
const apiUrl = base + 'api.php'

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox'],
})
const errs = []
let pass = 0,
  fail = 0
const check = (name, cond) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name)
  cond ? pass++ : fail++
}

const page = await browser.newPage()
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errs.push('console: ' + m.text())
})

const waitText = (substr, timeout = 15000) =>
  new Promise((resolve, reject) => {
    const t0 = Date.now()
    const iv = setInterval(async () => {
      const txt = await page.evaluate(() => document.body.innerText || '')
      if (txt.includes(substr)) {
        clearInterval(iv)
        resolve(txt)
      } else if (Date.now() - t0 > timeout) {
        clearInterval(iv)
        reject(new Error(`[${substr}] timeout`))
      }
    }, 200)
  })
const bodyText = () => page.evaluate(() => document.body.innerText || '')
// hash 变化属于同文档导航，不会重载页面；需要重置内存态（如冲突弹窗）时必须显式 reload
const goto = async (hash) => {
  await page.goto(base + FILE + '#' + hash, { waitUntil: 'networkidle2' })
}
const clickByText = async (text) => {
  const ok = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('button, a, div, label')].find(
      (e) => e.innerText && e.innerText.trim() === t
    )
    if (el) {
      el.click()
      return true
    }
    return false
  }, text)
  if (!ok) throw new Error('click not found: ' + text)
}
// 同步进行中按钮为 disabled，直接 click 会被忽略；先等到可用
const clickEnabled = async (text) => {
  for (let i = 0; i < 40; i++) {
    const r = await page.evaluate((t) => {
      const el = [...document.querySelectorAll('button')].find((e) => e.innerText && e.innerText.trim() === t)
      if (!el) return 'missing'
      if (el.disabled) return 'disabled'
      el.click()
      return 'clicked'
    }, text)
    if (r === 'clicked') return
    if (r === 'missing') throw new Error('button not found: ' + text)
    await new Promise((r2) => setTimeout(r2, 500))
  }
  throw new Error('button still disabled: ' + text)
}
const amountCount = async () => {
  const txt = await bodyText()
  return (txt.match(/¥[\d,]+\.\d{2}/g) || []).length
}
// 页面分帧渲染，直接取可能读到半截结果；连续两次一致才认为稳定
const stableAmountCount = async () => {
  let prev = -1
  for (let i = 0; i < 8; i++) {
    const cur = await amountCount()
    if (cur === prev) return cur
    prev = cur
    await new Promise((r) => setTimeout(r, 400))
  }
  return prev
}
const addTransaction = async (amount) => {
  await goto('/add')
  await waitText('记账')
  await page.type('input[inputmode="decimal"]', amount)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.grid.grid-cols-4 button')]
    if (btns[0]) btns[0].click()
  })
  await new Promise((r) => setTimeout(r, 250))
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '保存并继续记账')
    if (b) b.click()
  })
  await new Promise((r) => setTimeout(r, 800))
}
const pushDirect = async (dataObj, baseVersion, force = false) => {
  const r = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Sync-Token': TOKEN },
    body: JSON.stringify({ baseVersion, data: dataObj, force }),
  })
  return { status: r.status, json: await r.json().catch(() => null) }
}

// ===== 前置：配置并启用同步 =====
await goto('/settings/sync')
await waitText('云同步')
await page.evaluate((u, t) => {
  window.__api = u
  window.__tok = t
}, apiUrl, TOKEN)
await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('input')]
  const urlInput = inputs.find((i) => i.placeholder && i.placeholder.includes('api.php'))
  const tokInput = inputs.find((i) => i.placeholder && i.placeholder.includes('令牌'))
  const set = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  if (urlInput) set(urlInput, window.__api)
  if (tokInput) set(tokInput, window.__tok)
})
await new Promise((r) => setTimeout(r, 400))
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(
    (b) => b.innerText.trim() === '已关闭' || b.innerText.trim() === '已启用'
  )
  if (btn && btn.innerText.trim() === '已关闭') btn.click()
})
await new Promise((r) => setTimeout(r, 400))
check(
  '前置条件：同步已启用',
  await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === '已启用')
  )
)

// 清空示例账本：未动过的示例数据（isSeed）会被同步层拦住不允许上传
await goto('/settings/data')
await waitText('导出 JSON')
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('清空全部数据'))
  if (b) b.click()
})
await new Promise((r) => setTimeout(r, 300))
await clickByText('确认清空')
await new Promise((r) => setTimeout(r, 600))

// ===== T2：上传，检查请求载荷 =====
await goto('/settings/sync')
await waitText('云同步')
await clickEnabled('立即上传')
await new Promise((r) => setTimeout(r, 1800))
check('T2a 同步请求载荷不含同步令牌', lastPostRaw.length > 0 && !lastPostRaw.includes(TOKEN))
check('T2b 同步请求载荷不含 pinHash 字段', !/"pinHash"/.test(lastPostRaw))
check(
  'T2c 同步载荷 settings 不含任何设备级字段',
  DEVICE_KEYS.every((k) => !new RegExp(`"${k}"`).test(lastPostRaw))
)
const storedSettings = (serverState.data || {}).settings || {}
check(
  'T2d 落盘到服务器的 settings 不含设备级字段',
  DEVICE_KEYS.every((k) => !(k in storedSettings))
)
check('T2e 账本字段仍正常上传（defaultCurrency 存在）', 'defaultCurrency' in storedSettings)

// ===== T1：导出备份文件 =====
await goto('/settings/data')
await waitText('导出 JSON')
await clickByText('导出 JSON')
await new Promise((r) => setTimeout(r, 700))
const exportJson = await page.evaluate(() => {
  const ta = document.querySelector('textarea')
  return ta ? ta.value : ''
})
check('T1a 成功取到导出 JSON', exportJson.length > 50 && exportJson.includes('xiaojinku'))
check('T1b 备份文件不含同步令牌', !exportJson.includes(TOKEN))
check('T1c 备份文件不含 pinHash', !exportJson.includes('pinHash'))
check('T1d 备份文件不含 sync 配置', !/"sync"/.test(exportJson))
check(
  'T1e 备份文件不含 appLockEnabled / theme',
  !/"appLockEnabled"/.test(exportJson) && !/"theme"/.test(exportJson)
)
check('T1f 备份文件仍含账本字段（cashOpening）', /"cashOpening"/.test(exportJson))
check('T1g 备份格式版本已升级为 3', /"version":\s*3/.test(exportJson))

// ===== T5：损坏数据文件不当作空账本 =====
await addTransaction('88.88')
await goto('/transactions')
await waitText('流水')
const beforeCorrupt = await stableAmountCount()
corruptMode = true
await goto('/settings/sync')
await waitText('云同步')
await clickEnabled('立即下载')
let corruptErr = ''
try {
  corruptErr = await waitText('同步失败', 8000)
} catch {
  corruptErr = ''
}
check('T5a 服务器数据损坏时返回错误而非空账本', corruptErr.includes('同步失败'))
corruptMode = false
await goto('/transactions')
await page.reload({ waitUntil: 'networkidle2' })
await waitText('流水')
const afterCorrupt = await stableAmountCount()
check('T5b 损坏场景下本地数据未被覆盖', afterCorrupt === beforeCorrupt && afterCorrupt > 0)
check('T5c 本地流水仍包含 88.88', (await bodyText()).includes('88.88'))

// ===== T3：导入伪造文件（含他人令牌 / PIN / 主题 / 锁开关）=====
const forged = {
  app: 'xiaojinku',
  version: 3,
  exported_at: new Date().toISOString(),
  liabilities: [],
  categories: [
    { id: 'c_forged', name: '导入测试', type: 'expense', icon: '🍚', color: '#5fa896', is_system: false, order: 1 },
  ],
  transactions: [],
  securities: [],
  investTxns: [],
  settings: {
    defaultCurrency: 'CNY',
    fxRate: { rate: 7.2, updated_at: new Date().toISOString(), manual: true },
    hkdRate: { rate: 0.915, updated_at: new Date().toISOString(), manual: true },
    currencySymbolUSD: '$',
    currencySymbolCNY: '¥',
    cashOpening: 999999,
    sync: { enabled: true, url: 'https://evil.example.com/api.php', token: FORGED_TOKEN, version: 0 },
    pinHash: 'FORGED_PIN_HASH_0000',
    appLockEnabled: true,
    theme: 'dark',
    lastBackupAt: '2020-01-01T00:00:00.000Z',
  },
}
const tmpFile = path.join(os.tmpdir(), 'xiaojinku-forged-import.json')
fs.writeFileSync(tmpFile, JSON.stringify(forged))
await goto('/settings/data')
await waitText('导出 JSON')
const fileInput = await page.$('input[type=file]')
await fileInput.uploadFile(tmpFile)
await new Promise((r) => setTimeout(r, 1000))
check('T3a 导入成功提示出现', (await bodyText()).includes('导入成功'))

await goto('/settings/sync')
await waitText('云同步')
const tokenNow = await page.evaluate(() => {
  const i = [...document.querySelectorAll('input')].find((x) => x.placeholder && x.placeholder.includes('令牌'))
  return i ? i.value : ''
})
check('T3b 本机同步令牌未被导入文件覆盖', tokenNow === TOKEN)
check('T3c 本机同步令牌未变成伪造值', tokenNow !== FORGED_TOKEN)

// 重载后不应被陌生 PIN 锁在门外（若 pinHash/appLockEnabled 被覆盖，这里会出现锁屏）
await goto('/')
await waitText('净资产')
const afterReload = await bodyText()
check('T3d 导入后重载未被陌生 PIN 锁屏', !afterReload.includes('请输入 PIN') && !afterReload.includes('解锁'))
check('T3e 导入的账本字段已生效（期初现金 999999）', afterReload.includes('999,999'))

// ===== T4a/b/c：客户端收到 409 时不静默覆盖本地 =====
await addTransaction('66.66')
await goto('/transactions')
await waitText('流水')
const beforeConflict = await stableAmountCount()

await pushDirect(
  {
    app: 'xiaojinku',
    version: 3,
    exported_at: new Date().toISOString(),
    liabilities: [], categories: [], transactions: [], securities: [], investTxns: [],
    settings: { defaultCurrency: 'CNY', cashOpening: 1 },
  },
  0,
  true
)
await goto('/settings/sync')
await waitText('云同步')
await clickEnabled('立即上传')
await new Promise((r) => setTimeout(r, 2200))
check('T4a 服务器版本领先时弹出冲突框', (await bodyText()).includes('数据冲突'))

await goto('/transactions')
await page.reload({ waitUntil: 'networkidle2' })
await waitText('流水')
const afterConflict = await stableAmountCount()
check('T4b 冲突时本地数据未被静默覆盖', afterConflict === beforeConflict && afterConflict > 0)
check('T4c 本地流水仍包含 66.66', (await bodyText()).includes('66.66'))

// ===== T4d/e 并发契约：同一 baseVersion 的两个并发 POST 应一成一冲突 =====
criticalDelay = 250
const before = serverState.version
const [r1, r2] = await Promise.all([
  pushDirect({ app: 'xiaojinku', version: 3, exported_at: 'A', settings: { cashOpening: 1 } }, before),
  pushDirect({ app: 'xiaojinku', version: 3, exported_at: 'B', settings: { cashOpening: 1 } }, before),
])
const codes = [r1.status, r2.status].sort()
check('T4d 并发同基准上传：恰好一个成功一个冲突（200 + 409）', codes[0] === 200 && codes[1] === 409)
check('T4e 并发后版本号只推进一次', serverState.version === before + 1)
criticalDelay = 0

const appErrs = errs.filter((e) => !e.includes('Failed to load resource'))
check('全程无 JS 报错', appErrs.length === 0)
if (appErrs.length) console.log('ERRORS:', appErrs.join(' | '))
console.log(`\n结果: ${pass} passed, ${fail} failed`)
await browser.close()
httpServer.close()
process.exit(fail ? 1 : 0)

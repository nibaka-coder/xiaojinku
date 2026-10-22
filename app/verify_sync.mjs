import puppeteer from 'puppeteer-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

// 模拟 deploy/api.php 的服务端契约（含版本号与 409 冲突），用于在本地验证同步逻辑
const root = path.resolve('dist')
const FILE = 'index.html'
const TOKEN = 'testtoken123'

let serverState = { version: 0, updatedAt: null, data: null }

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
    if ((req.headers['x-sync-token'] || '') !== TOKEN) return send(401, { ok: false, error: 'unauthorized' })
    if (req.method === 'GET') {
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
      req.on('end', () => {
        const j = JSON.parse(body || '{}')
        const base = Number(j.baseVersion || 0)
        if (!j.force && serverState.version > base && serverState.data) {
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
        return send(200, { ok: true, version: serverState.version, updatedAt: serverState.updatedAt })
      })
      return
    }
  }
  // 静态页面
  if (req.url.includes('favicon')) {
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

async function makeDevice(label) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errs.push(`${label}: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource'))
      errs.push(`${label} console: ${m.text()}`)
  })
  return { ctx, page, label }
}

const waitText = (page, substr, timeout = 10000) =>
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
const bodyText = (page) => page.evaluate(() => document.body.innerText || '')
const clickByText = async (page, text) => {
  const ok = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('button, a, div, label')]
    const el = els.find((e) => e.innerText && e.innerText.trim() === t)
    if (el) {
      el.click()
      return true
    }
    return false
  }, text)
  if (!ok) throw new Error('click not found: ' + text)
}

// 在设置页配置同步
async function configureSync(page) {
  await page.goto(base + FILE + '#/settings', { waitUntil: 'networkidle2' })
  await waitText(page, '云同步')
  // 整页跳转会清空页面全局变量，故在导航后再注入
  await page.evaluate((u, t) => { window.__api = u; window.__tok = t }, apiUrl, TOKEN)
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')]
    const urlInput = inputs.find((i) => i.placeholder && i.placeholder.includes('api.php'))
    // 注意：PIN 输入框也是 password 类型且排在前面，必须按 placeholder 精确匹配令牌框
    const tokInput = inputs.find((i) => i.placeholder && i.placeholder.includes('令牌'))
    const set = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (urlInput) set(urlInput, '')
    if (urlInput) set(urlInput, window.__api)
    if (tokInput) set(tokInput, window.__tok)
  })
  await new Promise((r) => setTimeout(r, 300))
}
// ===== 设备 A（电脑）：记录一笔自己的交易后上传 =====
const A = await makeDevice('A')
await A.page.goto(base + FILE + '#/', { waitUntil: 'networkidle2' })
await waitText(A.page, '净资产')
await configureSync(A.page)
// 启用同步
await A.page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(
    (b) => b.innerText.trim() === '已关闭' || b.innerText.trim() === '已启用'
  )
  if (btn && btn.innerText.trim() === '已关闭') btn.click()
})
await new Promise((r) => setTimeout(r, 200))
// 先清空示例数据，做一个干净的账本
await A.page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  const b = btns.find((x) => x.innerText.includes('清空全部数据'))
  if (b) b.click()
})
await new Promise((r) => setTimeout(r, 300))
await clickByText(A.page, '确认清空')
await new Promise((r) => setTimeout(r, 500))
let txt = await bodyText(A.page)
check('A：清空后账本为空（总资产 0）', txt.includes('¥0.00'))

// 记一笔 4800 的车险（带摊销）
await A.page.goto(base + FILE + '#/add', { waitUntil: 'networkidle2' })
await waitText(A.page, '记账')
await A.page.type('input[inputmode="decimal"]', '4800')
await A.page.evaluate(() => {
  const btns = [...document.querySelectorAll('.grid.grid-cols-4 button')]
  if (btns[0]) btns[0].click()
})
await new Promise((r) => setTimeout(r, 200))
await A.page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '保存并继续记账')
  if (b) b.click()
})
await new Promise((r) => setTimeout(r, 800))

// 上传
await A.page.goto(base + FILE + '#/settings', { waitUntil: 'networkidle2' })
await waitText(A.page, '云同步')
await clickByText(A.page, '立即上传')
await new Promise((r) => setTimeout(r, 1500))
txt = await bodyText(A.page)
check('A：上传成功（显示服务器版本 1）', txt.includes('服务器版本 1'))

// ===== 设备 B（手机，全新）：拉取应自动获取 A 的数据，不弹冲突 =====
const B = await makeDevice('B')
await B.page.goto(base + FILE + '#/', { waitUntil: 'networkidle2' })
await waitText(B.page, '净资产')
await configureSync(B.page)
await B.page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '已关闭')
  if (btn) btn.click()
})
await new Promise((r) => setTimeout(r, 300))
await clickByText(B.page, '立即下载')
await new Promise((r) => setTimeout(r, 1500))
txt = await bodyText(B.page)
check('B：下载后未弹冲突框', !txt.includes('数据冲突'))
// B 应有 A 的那笔 4800 流水
await B.page.goto(base + FILE + '#/transactions', { waitUntil: 'networkidle2' })
await waitText(B.page, '流水')
txt = await bodyText(B.page)
check('B：成功取到 A 的 4800 流水', txt.includes('4,800.00'))

// ===== 冲突场景：两端各自离线改动后再上传 =====
// A 改一笔（自动推送关闭不便，这里用立即上传前先让 B 也改并上传，制造版本差）
// 先让 B 上传自己的改动（B 版本 = server 1）
await B.page.goto(base + FILE + '#/add', { waitUntil: 'networkidle2' })
await waitText(B.page, '记账')
await B.page.type('input[inputmode="decimal"]', '333')
await B.page.evaluate(() => {
  const btns = [...document.querySelectorAll('.grid.grid-cols-4 button')]
  if (btns[0]) btns[0].click()
})
await new Promise((r) => setTimeout(r, 200))
await B.page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '保存并继续记账')
  if (b) b.click()
})
await new Promise((r) => setTimeout(r, 500))
await B.page.goto(base + FILE + '#/settings', { waitUntil: 'networkidle2' })
await waitText(B.page, '云同步')
await clickByText(B.page, '立即上传')
await new Promise((r) => setTimeout(r, 1500))
txt = await bodyText(B.page)
check('B：上传成功（服务器版本 2）', txt.includes('服务器版本 2'))

// A 此时仍是版本 1，改数据后上传 → 应 409 冲突
await A.page.goto(base + FILE + '#/add', { waitUntil: 'networkidle2' })
await waitText(A.page, '记账')
await A.page.type('input[inputmode="decimal"]', '777')
await A.page.evaluate(() => {
  const btns = [...document.querySelectorAll('.grid.grid-cols-4 button')]
  if (btns[0]) btns[0].click()
})
await new Promise((r) => setTimeout(r, 200))
await A.page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '保存并继续记账')
  if (b) b.click()
})
await new Promise((r) => setTimeout(r, 500))
await A.page.goto(base + FILE + '#/settings', { waitUntil: 'networkidle2' })
await waitText(A.page, '云同步')
await clickByText(A.page, '立即上传')
await new Promise((r) => setTimeout(r, 1800))
txt = await bodyText(A.page)
check('A：与服务器版本不一致时弹出冲突框', txt.includes('数据冲突'))
check('冲突框提示不可撤销与先备份', txt.includes('不可撤销'))

// 选择「保留我的」→ 强制覆盖服务器
await clickByText(A.page, '保留我的')
await new Promise((r) => setTimeout(r, 2000))
txt = await bodyText(A.page)
check('冲突解决后关闭弹窗', !txt.includes('数据冲突'))
check('A：强制覆盖后版本推进到 3', txt.includes('服务器版本 3'))
// 服务器最终数据应包含 A 的 777
const finalTxns = (serverState.data?.transactions || []).map((t) => t.amount)
check('服务器端最终保留 A 的 777', finalTxns.includes(777))

// ===== 概览页不应再出现备份提醒条（已按用户要求移除） =====
await A.page.goto(base + FILE + '#/', { waitUntil: 'networkidle2' })
await waitText(A.page, '净资产')
txt = await bodyText(A.page)
check('概览页已无备份提醒条', !txt.includes('未备份') && !txt.includes('立即备份'))

const appErrs = errs.filter((e) => !e.includes('Failed to load resource'))
check('两台设备均无 JS 报错', appErrs.length === 0)
if (appErrs.length) console.log('ERRORS:', appErrs.join(' | '))
console.log(`\n结果: ${pass} passed, ${fail} failed`)
await browser.close()
httpServer.close()
process.exit(fail ? 1 : 0)

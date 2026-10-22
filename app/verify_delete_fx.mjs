import puppeteer from 'puppeteer-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('dist')
const FILE = 'index.html'
const server = http.createServer((req, res) => {
  if (req.url.includes('favicon')) { res.writeHead(204); res.end(); return }
  const f = path.join(root, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]))
  fs.readFile(f, (e, buf) => {
    if (e) { res.writeHead(404); res.end('nf'); return }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(buf)
  })
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/`

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
const errs = []
page.on('pageerror', e => errs.push(e.message))
page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text()) })
// 关键：不要自动接受原生 confirm（模拟预览沙箱里 confirm 被拦截/返回 false 的真实情况）
// 本次删除改用应用内二次确认，根本不调用 window.confirm

const waitText = (substr, timeout = 8000) => new Promise((resolve, reject) => {
  const t0 = Date.now()
  const iv = setInterval(async () => {
    const txt = await page.evaluate(() => document.querySelector('main')?.innerText || '')
    if (txt.includes(substr)) { clearInterval(iv); resolve(txt) }
    else if (Date.now() - t0 > timeout) { clearInterval(iv); reject(new Error('timeout waiting: ' + substr)) }
  }, 200)
})
const clickByText = async (text) => {
  const ok = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('button, a, div')]
    const el = els.find(e => e.innerText && e.innerText.trim() === t)
    if (el) { el.click(); return true } return false
  }, text)
  if (!ok) throw new Error('click not found: ' + text)
}
const clickAria = async (label) => {
  const ok = await page.evaluate((l) => {
    const el = document.querySelector(`button[aria-label="${l}"]`)
    if (el) { el.click(); return true } return false
  }, label)
  if (!ok) throw new Error('aria click not found: ' + label)
}

// ---- 1) 应用内二次确认删除（不依赖原生 confirm） ----
await page.goto(base + FILE + '#/invest/holdings', { waitUntil: 'networkidle2' })
let txt = await waitText('持仓总览')
const before = (txt.match(/股/g) || []).length
console.log('持仓页初始证券卡片数(估算):', before)

// 点第一只证券的「⋯」管理按钮
await clickAria('管理证券')
txt = await waitText('证券管理')
console.log('1) 管理弹窗打开:', txt.includes('证券管理') && txt.includes('笔交易'))

// 点「删除该证券」→ 应进入二次确认
await clickByText('删除该证券')
txt = await waitText('确认删除')
console.log('2) 出现二次确认(确认删除按钮):', txt.includes('确认删除') && txt.includes('不可撤销'))

// 点「确认删除」→ 应真正删除并关闭弹窗
await clickByText('确认删除')
await new Promise(r => setTimeout(r, 600))
txt = await page.evaluate(() => document.querySelector('main')?.innerText || '')
const modalClosed = !txt.includes('不可撤销')
console.log('3) 删除执行且弹窗关闭:', modalClosed)
const after = (txt.match(/股/g) || []).length
console.log('4) 证券数量减少:', after < before, `(before=${before}, after=${after})`)

// ---- 2) 刷新行情（含汇率自动获取）不崩溃、按钮复位 ----
await page.goto(base + FILE + '#/invest/holdings', { waitUntil: 'networkidle2' })
await waitText('持仓总览')
await clickByText('↻ 刷新行情')
// 东财在本沙箱 IP 被限速，JSONP 6s 超时叠加，最长等 16s
let reset = false
for (let i = 0; i < 32; i++) {
  await new Promise(r => setTimeout(r, 500))
  txt = await page.evaluate(() => document.querySelector('main')?.innerText || '')
  if (txt.includes('↻ 刷新行情') && !txt.includes('刷新中')) { reset = true; break }
}
console.log('5) 刷新后按钮复位为「↻ 刷新行情」:', reset)

// ---- 3) 设置页汇率按钮文案 + 提示 ----
await page.goto(base + FILE + '#/settings', { waitUntil: 'networkidle2' })
txt = await waitText('汇率')
console.log('6) 设置页有「↻ 刷新汇率」按钮:', txt.includes('刷新汇率'))
console.log('7) 有「刷新行情也会一并刷新汇率」提示:', txt.includes('刷新行情') && txt.includes('汇率'))

console.log('JS_ERRORS:', errs.length ? errs.join(' | ') : 'none')
await browser.close(); server.close()

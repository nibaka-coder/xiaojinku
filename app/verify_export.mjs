import puppeteer from 'puppeteer-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('dist')
const FILE = 'xiaojinku-v2.19.html'
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

const waitText = (substr, timeout = 10000) => new Promise((resolve, reject) => {
  const t0 = Date.now()
  const iv = setInterval(async () => {
    const txt = await page.evaluate(() => document.body.innerText || '')
    if (txt.includes(substr)) { clearInterval(iv); resolve(txt) }
    else if (Date.now() - t0 > timeout) { clearInterval(iv); reject(new Error('timeout waiting: ' + substr)) }
  }, 200)
})
const clickByText = async (text) => {
  const ok = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('button, a, div, label')]
    const el = els.find(e => e.innerText && e.innerText.trim() === t)
    if (el) { el.click(); return true } return false
  }, text)
  if (!ok) throw new Error('click not found: ' + text)
}
let pass = 0, fail = 0
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); cond ? pass++ : fail++ }

await page.goto(base + FILE + '#/settings', { waitUntil: 'networkidle2' })
await waitText('数据与隐私')
await clickByText('导出 JSON')
// 导出应弹出 JSON 模态框（即使下载被拦截，至少弹窗可复制）
await waitText('复制全部', 6000)
const taVal = await page.evaluate(() => {
  const ta = document.querySelector('textarea')
  return ta ? ta.value : ''
})
const modalShown = taVal.includes('xiaojinku')
check('点击导出后弹出 JSON 弹窗（含 xiaojinku 数据）', modalShown)
const hasFields = taVal.includes('"app"') && (taVal.includes('"transactions"') || taVal.includes('"settings"'))
check('导出的 JSON 含结构字段(transactions/settings)', hasFields)
// 复制按钮存在并可点击
const copyBtn = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === '复制全部')
  if (b) { b.click(); return true } return false
})
check('「复制全部」按钮可点击', copyBtn)
await new Promise(r => setTimeout(r, 300))

check('无 JS 报错', errs.length === 0)
if (errs.length) console.log('ERRORS:', errs.join(' | '))
console.log(`\n结果: ${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail ? 1 : 0)

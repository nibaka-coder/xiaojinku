import puppeteer from 'puppeteer-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('dist')
const FILE = 'index.html'
const MIME = { '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  if (req.url.includes('favicon')) { res.writeHead(204); res.end(); return }
  const f = path.join(root, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]))
  fs.readFile(f, (e, buf) => {
    if (e) { res.writeHead(404); res.end('nf'); return }
    res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] ?? 'text/html; charset=utf-8' }); res.end(buf)
  })
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/`

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
const errs = []
page.on('pageerror', e => errs.push(e.message))

const waitText = (substr, timeout = 10000) => new Promise((resolve, reject) => {
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
const mainText = () => page.evaluate(() => document.querySelector('main')?.innerText || '')
let pass = 0, fail = 0
let txt = ''
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); cond ? pass++ : fail++ }

// ---- 1) 目标预算模块已移除 ----
await page.goto(base + FILE + '#/', { waitUntil: 'networkidle2' })
await waitText('概览')
const navTxt = await page.evaluate(() => document.body.innerText)
check('侧边栏/底栏不再有「目标预算」', !navTxt.includes('目标预算'))
await page.goto(base + FILE + '#/goals/list', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 500))
txt = await mainText()
check('旧 /goals 路由重定向回概览', txt.includes('净资产') || txt.includes('概览'))

// ---- 2) 刷新行情：名称回填（腾讯通道带名称） ----
await page.goto(base + FILE + '#/invest/holdings', { waitUntil: 'networkidle2' })
await waitText('持仓总览')
await clickByText('↻ 刷新行情')
let named = false, priceOk = false
for (let i = 0; i < 50; i++) {
  await new Promise(r => setTimeout(r, 500))
  txt = await mainText()
  if (txt.includes('刷新中')) continue
  break
}
txt = await mainText()
// 种子数据 600519 茅台 / 601919 中远海控 等，名称应被行情回填
const hasName = /贵州茅台|中远海控|腾讯控股|苹果/.test(txt)
const mv = (txt.match(/持仓市值\n¥([\d,]+\.\d{2})/) || [])[1]
priceOk = mv && parseFloat(mv.replace(/,/g, '')) > 0
check('刷新后市值 > 0 (¥' + mv + ')', !!priceOk)
check('证券名称已从行情回填（出现真实股名）', hasName)
console.log('持仓页名称样例:', (txt.match(/(?:贵州茅台|中远海控|腾讯控股|苹果)[^\n]*/) || ['(未匹配到)'])[0])

check('无 JS 报错', errs.length === 0)
if (errs.length) console.log('ERRORS:', errs.join(' | '))
console.log(`\n结果: ${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail ? 1 : 0)

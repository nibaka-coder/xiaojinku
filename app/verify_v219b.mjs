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
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); cond ? pass++ : fail++ }

// ---- 1) 刷新行情：价格应变为非零（腾讯 gtimg 全局变量通道） ----
await page.goto(base + FILE + '#/invest/holdings', { waitUntil: 'networkidle2' })
await waitText('持仓总览')
let txt = await mainText()
const m0 = txt.match(/¥([\d,]+\.\d{2})/)
console.log('刷新前市值文本:', (txt.match(/持仓市值[\s\S]{0,30}/) || [''])[0].replace(/\n/g, ' '))
await clickByText('↻ 刷新行情')
// 最多等 25s：东财 fetch 3.5s 超时 → 腾讯通道应 1s 内出价
let updated = false
for (let i = 0; i < 50; i++) {
  await new Promise(r => setTimeout(r, 500))
  txt = await mainText()
  if (txt.includes('刷新中')) continue
  const mv = txt.match(/持仓市值\n¥([\d,]+\.\d{2})/)
  if (mv && parseFloat(mv[1].replace(/,/g, '')) > 0) { updated = true; break }
  if (!txt.includes('刷新中')) break // 已复位但仍为 0 → 失败
}
const mvFinal = (txt.match(/持仓市值\n¥([\d,]+\.\d{2})/) || [])[1]
check('刷新后持仓市值 > 0 (got ¥' + mvFinal + ')', updated)

// ---- 2) 预算删除全流程（应用内二次确认，不依赖原生 confirm） ----
await page.goto(base + FILE + '#/settings', { waitUntil: 'networkidle2' })
await waitText('预算')
txt = await mainText()
const chipRe = /[^\n]*¥[\d,.]+ ✕/g
const chipsBefore = (txt.match(chipRe) || []).length
console.log('预算 chip 数(删前):', chipsBefore)
check('存在预算 chip', chipsBefore > 0)
if (chipsBefore > 0) {
  // 点击第一个预算 chip（文本如「总支出 ¥9000 ✕」）
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button.chip')].find(b => b.innerText.includes('✕'))
    if (btn) { btn.click(); return btn.innerText.trim() } return null
  })
  console.log('点击 chip:', clicked)
  txt = await waitText('删除预算')
  check('出现「删除预算」确认弹窗', txt.includes('此操作不可撤销'))
  await clickByText('确认删除')
  await new Promise(r => setTimeout(r, 500))
  txt = await mainText()
  const chipsAfter = (txt.match(chipRe) || []).length
  check('确认后预算已删除 (chips ' + chipsBefore + '→' + chipsAfter + ')', chipsAfter === chipsBefore - 1)
}

// ---- 3) 无 JS 报错 ----
check('无 JS 报错', errs.length === 0)
if (errs.length) console.log('ERRORS:', errs.join(' | '))

console.log(`\n结果: ${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail ? 1 : 0)

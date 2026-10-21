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
const bodyText = () => page.evaluate(() => document.body.innerText || '')
let pass = 0, fail = 0
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); cond ? pass++ : fail++ }
const readMonthExpense = async () => {
  await page.goto(base + FILE + '#/', { waitUntil: 'networkidle2' })
  await waitText('本月支出')
  const t = await bodyText()
  const m = t.match(/本月支出[^\n]*\n¥([\d,]+\.\d{2})/)
  return m ? parseFloat(m[1].replace(/,/g, '')) : null
}

// 1) 读基线本月支出
const before = await readMonthExpense()
console.log('基线 本月支出 =', before)

// 2) 记一笔 4800 的车险，摊销 12 期
await page.goto(base + FILE + '#/add', { waitUntil: 'networkidle2' })
await waitText('记账')
await page.type('input[inputmode="decimal"]', '4800')
// 选第一个支出分类
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.grid.grid-cols-4 button')]
  if (btns[0]) btns[0].click()
})
// 开启摊销
const toggled = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('按区间摊销'))
  if (b) { b.click(); return true } return false
})
check('记账页存在「按区间摊销」开关', toggled)
await new Promise(r => setTimeout(r, 300))
let txt = await bodyText()
check('开启后显示「每月计入成本」提示', txt.includes('每月计入成本'))
const perShown = (txt.match(/每月计入成本 ¥([\d,]+\.\d{2})/) || [])[1]
check('月摊金额 = ¥400.00（4800/12）got ' + perShown, perShown === '400.00')

// 保存
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === '保存并继续记账')
  if (b) b.click()
})
await new Promise(r => setTimeout(r, 600))

// 3) 概览本月支出应只增加 400（而非 4800）
const after = await readMonthExpense()
console.log('记账后 本月支出 =', after)
const delta = after - before
check('本月支出只增加 400（摊销生效）delta=' + delta.toFixed(2), Math.abs(delta - 400) < 0.5)
txt = await bodyText()
check('概览标注「摊销口径」', txt.includes('摊销口径'))

// 4) 流水显示实际金额 + 摊销标记
await page.goto(base + FILE + '#/transactions', { waitUntil: 'networkidle2' })
await waitText('流水')
txt = await bodyText()
check('流水显示实际金额 ¥4,800.00', txt.includes('4,800.00'))
check('流水标记「摊销12期」', txt.includes('摊销12期'))

check('无 JS 报错', errs.length === 0)
if (errs.length) console.log('ERRORS:', errs.join(' | '))
console.log(`\n结果: ${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail ? 1 : 0)

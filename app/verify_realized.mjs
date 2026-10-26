import puppeteer from 'puppeteer-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('dist')
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

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--no-sandbox'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => { errors.push('pageerror: ' + e.message); console.log('LIVE PAGEERROR:', e.message, e.stack?.split('\n')[1]||'') })

// helper: set React-controlled input value
async function setInput(sel, val) {
  await page.evaluate((sel, val) => {
    const el = document.querySelector(sel)
    const proto = Object.getPrototypeOf(el)
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, val)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, sel, String(val))
}
async function clickByText(text) {
  await page.evaluate((t) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t)?.click(), text)
}
async function clickContains(text) {
  await page.evaluate((t) => [...document.querySelectorAll('button')].find(b => b.textContent.includes(t) && b.offsetParent !== null)?.click(), text)
}
async function waitText(t) {
  for (let i = 0; i < 50; i++) {
    const ok = await page.evaluate((t) => document.body.innerText.includes(t), t)
    if (ok) return
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error('waitText timeout: ' + t)
}

// go to add, switch to 卖出
await page.goto(base + 'index.html#/invest/add', { waitUntil: 'networkidle2' })
await waitText('股数')
await new Promise(r => setTimeout(r, 300))
await clickByText('卖出')
await new Promise(r => setTimeout(r, 400))
console.log('AFTER CLICK 卖出:', (await page.evaluate(() => document.body.innerText.replace(/\n/g,' | '))).slice(0, 300))
await waitText('选择卖出批次')
await new Promise(r => setTimeout(r, 300))
// default secId = first security (seed 茅台). Set shares & price for partial sell 50 @ 1700
await setInput('input[type="number"]', '50')          // first number input = 股数
const nums = await page.$$('input[type="number"]')
await nums[1].evaluate(el => { const s=Object.getPrototypeOf(el); Object.getOwnPropertyDescriptor(s,'value').set.call(el,'1700'); el.dispatchEvent(new Event('input',{bubbles:true})) })
await new Promise(r => setTimeout(r, 200))
await clickByText('保存')
await new Promise(r => setTimeout(r, 400))

// second sell: remaining 50 @ 1800
await page.goto(base + 'index.html#/invest/add', { waitUntil: 'networkidle2' })
await waitText('股数')
await new Promise(r => setTimeout(r, 300))
await clickByText('卖出')
await waitText('选择卖出批次')
await new Promise(r => setTimeout(r, 300))
await setInput('input[type="number"]', '50')
const nums2 = await page.$$('input[type="number"]')
await nums2[1].evaluate(el => { const s=Object.getPrototypeOf(el); Object.getOwnPropertyDescriptor(s,'value').set.call(el,'1800'); el.dispatchEvent(new Event('input',{bubbles:true})) })
await new Promise(r => setTimeout(r, 200))
await clickByText('保存')
await new Promise(r => setTimeout(r, 400))

// trades page: check realized P/L on sell rows
await page.goto(base + 'index.html#/invest/trades', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 400))
const tradesText = await page.evaluate(() => document.querySelector('main').innerText.replace(/\n/g, ' | '))
console.log('TRADES:', tradesText.slice(0, 500))
console.log('has 已实现:', tradesText.includes('已实现'))
console.log('has ¥5,000 (5000.00):', tradesText.includes('5,000.00') || tradesText.includes('5,000'))
console.log('has ¥10,000:', tradesText.includes('10,000.00') || tradesText.includes('10,000'))

// expand a sell row
const expandInfo = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '▸')
  const found = btns.length
  btns[0]?.click()
  return found
})
console.log('expand buttons found:', expandInfo)
await new Promise(r => setTimeout(r, 300))
const expanded = await page.evaluate(() => document.querySelector('main').innerText.replace(/\n/g, ' | '))
console.log('after expand has 对应买入批次:', expanded.includes('对应买入批次'))
if (!expanded.includes('对应买入批次')) console.log('EXPAND DEBUG:', expanded.slice(0, 400))

// holdings summary
await page.goto(base + 'index.html#/invest/holdings', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 400))
const hold = await page.evaluate(() => document.querySelector('main').innerText.replace(/\n/g, ' | '))
console.log('HOLDINGS:', hold.slice(0, 300))
console.log('has 累计已实现盈亏:', hold.includes('累计已实现盈亏'))
console.log('realized ¥15,000:', hold.includes('15,000.00') || hold.includes('15,000'))

console.log('JS_ERRORS:', errors.length ? errors.join(' | ') : 'none')
await browser.close(); server.close()

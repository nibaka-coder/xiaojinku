import puppeteer from 'puppeteer-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('dist')
const server = http.createServer((req, res) => {
  if (req.url.includes('favicon')) { res.writeHead(204); res.end(); return }
  const f = path.join(root, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]))
  fs.readFile(f, (e, buf) => {
    if (e) { res.writeHead(404); res.end('nf'); return }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(buf)
  })
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/`

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + e.message))

// 1) nav no 行情
await page.goto(base + 'index.html#/invest/holdings', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 500))
const navText = await page.evaluate(() => document.body.innerText)
console.log('NAV has 行情:', navText.includes('行情'))
console.log('NAV has 持仓总览:', navText.includes('持仓总览'), '| 交易记录:', navText.includes('交易记录'))

// 2) trades page P/L before refresh
await page.goto(base + 'index.html#/invest/trades', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 500))
const before = await page.evaluate(() => document.querySelector('main')?.innerText.replace(/\n/g, ' | '))
console.log('TRADES(before refresh) shows 现价盈亏:', before.includes('现价盈亏'), '| 未更新:', before.includes('未更新'))

// 3) refresh and re-check
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('刷新行情'))?.click())
await new Promise(r => setTimeout(r, 5000))
const after = await page.evaluate(() => document.querySelector('main')?.innerText.replace(/\n/g, ' | '))
console.log('TRADES(after refresh) 现价盈亏:', after.includes('现价盈亏'), '| 未更新 still:', after.includes('未更新'))
console.log('SAMPLE:', after.slice(0, 260))

// 4) 行情 route redirects (no crash)
await page.goto(base + 'index.html#/invest/quote', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 500))
const hash = await page.evaluate(() => location.hash)
console.log('QUOTE route hash now:', hash, '(should be #/invest/holdings)')

console.log('JS_ERRORS:', errors.length ? errors.join(' | ') : 'none')
await browser.close()
server.close()

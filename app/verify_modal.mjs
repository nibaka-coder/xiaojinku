// Headless verify: modal must NOT auto-open on pages that pass open={...}
import puppeteer from 'puppeteer-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('dist')
const server = http.createServer((req, res) => {
  const f = path.join(root, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]))
  if (req.url.includes('favicon')) { res.writeHead(204); res.end(); return }
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
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

await page.goto(base + 'index.html#/invest/add', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 800))

const modalVisible = await page.evaluate(() => {
  const el = [...document.querySelectorAll('h3')].find(h => h.textContent === '删除交易')
  return !!el && el.offsetParent !== null
})
console.log('ADD_PAGE delete-modal visible:', modalVisible)

// also check Trades page (open={delId!==null})
await page.goto(base + 'index.html#/invest/trades', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 600))
const modalVisible2 = await page.evaluate(() => {
  const el = [...document.querySelectorAll('h3')].find(h => h.textContent === '删除交易')
  return !!el && el.offsetParent !== null
})
console.log('TRADES_PAGE delete-modal visible:', modalVisible2)

const rootHtml = await page.evaluate(() => document.getElementById('root').innerHTML.length)
console.log('root innerHTML length:', rootHtml)
console.log(errors.length ? 'JS_ERRORS: ' + errors.join(' | ') : 'JS_ERRORS: none')

const ok = !modalVisible && !modalVisible2 && rootHtml > 1000 && errors.length === 0
console.log(ok ? 'VERIFY_OK' : 'VERIFY_FAIL')

await browser.close()
server.close()
process.exit(ok ? 0 : 1)

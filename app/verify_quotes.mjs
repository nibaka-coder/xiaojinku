// E2E: load holdings, force refresh quotes (live JSONP), check market value magnitude
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
    res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] ?? 'text/html; charset=utf-8' })
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
await page.goto(base + 'index.html#/invest/holdings', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 800))

const before = await page.evaluate(() => document.querySelector('main')?.innerText.replace(/\n/g, ' | ').slice(0, 300))
console.log('BEFORE:', before)

// click 刷新行情
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('刷新行情'))
  b?.click()
})
await new Promise(r => setTimeout(r, 5000))

const after = await page.evaluate(() => document.querySelector('main')?.innerText.replace(/\n/g, ' | ').slice(0, 300))
console.log('AFTER:', after)

// magnitude check: parse 持仓市值
const valueOk = await page.evaluate(() => {
  const t = document.querySelector('main')?.innerText || ''
  const m = t.match(/([\d,]+\.\d{2})/)
  return m ? parseFloat(m[1].replace(/,/g, '')) < 1000000 : false
})
console.log('VALUE_MAGNITUDE_OK(<1,000,000):', valueOk)
console.log(errors.length ? 'JS_ERRORS: ' + errors.join(' | ') : 'JS_ERRORS: none')

await browser.close()
server.close()

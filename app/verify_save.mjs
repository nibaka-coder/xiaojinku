// Reproduce: fill new security form completely, click save, check holdings
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
await page.goto(base + 'index.html#/invest/add', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 600))

// click 新建 to switch to new-security mode
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('新建'))
  b?.click()
})
await new Promise(r => setTimeout(r, 300))

// state BEFORE typing shares
const before = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(x => x.textContent === '保存')
  return { disabled: btn?.disabled }
})

// fill code + shares + price
await page.type('input[placeholder*="600519"]', '601919')
const numInputs = await page.$$('input[type="number"]')
await numInputs[0].type('100')
await numInputs[1].type('13.20')
await new Promise(r => setTimeout(r, 200))

const after = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(x => x.textContent === '保存')
  return { disabled: btn?.disabled }
})
console.log('BTN disabled before filling shares:', JSON.stringify(before), '→ after:', JSON.stringify(after))

await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(x => x.textContent === '保存')
  btn?.click()
})
await new Promise(r => setTimeout(r, 600))

const check = await page.evaluate(() => ({
  hash: location.hash,
  bodyHas601919: document.body.innerText.includes('601919'),
}))
console.log('AFTER SAVE:', JSON.stringify(check))
console.log(errors.length ? 'JS_ERRORS: ' + errors.join(' | ') : 'JS_ERRORS: none')

await browser.close()
server.close()

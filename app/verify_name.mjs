// E2E: create security with NO name, refresh quotes, verify real name shows (not code)
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

// switch to new security mode
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('新建'))?.click())
await new Promise(r => setTimeout(r, 300))
// type only code, leave name empty
await page.type('input[placeholder*="600519"]', '601919')
const nums = await page.$$('input[type="number"]')
await nums[0].type('100')
await nums[1].type('13.20')
await new Promise(r => setTimeout(r, 200))
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent === '保存')?.click())
await new Promise(r => setTimeout(r, 500))

const created = await page.evaluate(() => document.querySelector('main')?.innerText.replace(/\n/g, ' | ').slice(0, 200))
console.log('AFTER CREATE (holdings):', created)

// ensure the new security name is empty-coded: refresh quotes
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('刷新行情'))?.click())
await new Promise(r => setTimeout(r, 5000))
const after = await page.evaluate(() => document.querySelector('main')?.innerText.replace(/\n/g, ' | ').slice(0, 400))
console.log('AFTER REFRESH:', after)
console.log('hasRealName(中远海控):', after.includes('中远海控'))
console.log('errors:', errors.length ? errors.join(' | ') : 'none')
await browser.close()
server.close()

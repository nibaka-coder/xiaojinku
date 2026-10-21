import puppeteer from 'puppeteer-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve('dist')
const server = http.createServer((req, res) => {
  if (req.url.includes('favicon')) { res.writeHead(204); res.end(); return }
  const f = path.join(root, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]))
  fs.readFile(f, (e, buf) => { if (e) { res.writeHead(404); res.end('nf'); return } res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(buf) })
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/`
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
const errs = []
page.on('pageerror', e => errs.push(e.message))
const txt = async () => page.evaluate(() => document.querySelector('main')?.innerText.replace(/\n/g, ' | ') || '')

// 交易记录页：种子应显示 买入，不应有 建仓；筛选器不应有 建仓
await page.goto(base + 'xiaojinku-v2.18.html#/invest/trades', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 800))
const trades = await txt()
console.log('TRADES has 建仓:', trades.includes('建仓'))
console.log('TRADES has 买入:', trades.includes('买入'))
const filters = await page.evaluate(() => [...document.querySelectorAll('button.chip')].map(b => b.textContent.trim()))
console.log('FILTER chips:', JSON.stringify(filters))

// 记账页：类型选项应为 买入/卖出/分红，无 建仓
await page.goto(base + 'xiaojinku-v2.18.html#/invest/add', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 600))
const typeBtns = await page.evaluate(() => [...document.querySelectorAll('.seg-item')].map(b => b.textContent.trim()))
console.log('ADD type buttons:', JSON.stringify(typeBtns))

// 新增一笔买入是否成功
async function setInput(sel, val) {
  await page.evaluate((sel, val) => {
    const el = document.querySelector(sel); const p = Object.getPrototypeOf(el); const s = Object.getOwnPropertyDescriptor(p, 'value').set
    s.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true }))
  }, sel, String(val))
}
await setInput('input[type="number"]', '10')
const nums = await page.$$('input[type="number"]')
await nums[1].evaluate(el => { const p = Object.getPrototypeOf(el); Object.getOwnPropertyDescriptor(p, 'value').set.call(el, '1700'); el.dispatchEvent(new Event('input', { bubbles: true })) })
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '保存')?.click())
await new Promise(r => setTimeout(r, 400))
await page.goto(base + 'xiaojinku-v2.18.html#/invest/trades', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 500))
const trades2 = await txt()
console.log('after add buy, trades has 买入:', trades2.includes('买入'))
console.log('JS_ERRORS:', errs.length ? errs.join(' | ') : 'none')
await browser.close(); server.close()

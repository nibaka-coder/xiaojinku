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

// 1) 概览：净资产 = 现金 + 投资市值 − 信用负债 − 长期负债
await page.goto(base + 'xiaojinku-v2.18.html#/', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 900))
const ov = await txt()
console.log('OVERVIEW has 投资市值:', ov.includes('投资市值'))
// 抽取数字
const nums = ov.match(/¥[\d,]+\.\d{2}/g) || []
console.log('OVERVIEW first numbers:', nums.slice(0, 6).join('  '))
// 找 净资产 / 现金 / 投资市值 / 信用负债 / 长期负债 对应的数字
function pick(label) {
  const i = ov.indexOf(label)
  if (i < 0) return null
  const seg = ov.slice(i, i + 40)
  const m = seg.match(/¥([\d,]+\.\d{2})/)
  return m ? m[1] : null
}
const nw = pick('净资产'), cash = pick('现金'), inv = pick('投资市值'), credit = pick('信用负债'), liab = pick('长期负债')
console.log('净资产=', nw, '现金=', cash, '投资市值=', inv, '信用=', credit, '长期=', liab)
const parse = s => s ? parseFloat(s.replace(/,/g, '')) : NaN
const sum = parse(cash) + parse(inv) - parse(credit) - parse(liab)
console.log('现金+投资−信用−长期 =', sum.toFixed(2), '| 净资产 =', parse(nw).toFixed(2), '| 平衡:', Math.abs(sum - parse(nw)) < 0.5)

// 2) 记账页有 投资转账 模式
await page.goto(base + 'xiaojinku-v2.18.html#/add', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 600))
const modes = await page.evaluate(() => [...document.querySelectorAll('.seg-item')].map(b => b.textContent.trim()))
console.log('ADD modes:', JSON.stringify(modes))

// 3) 记一笔投资转出：应减少现金、不计入本月支出
await page.evaluate(() => [...document.querySelectorAll('.seg-item')].find(b => b.textContent.includes('投资转账'))?.click())
await new Promise(r => setTimeout(r, 200))
const hasOut = await page.evaluate(() => [...document.querySelectorAll('.seg-item')].some(b => b.textContent.includes('转出')))
console.log('transfer has 转出/回收 sub:', hasOut)
// 输入金额 1000
await page.evaluate(() => {
  const el = document.querySelector('input[type="text"][inputmode="decimal"]'); const p = Object.getPrototypeOf(el); Object.getOwnPropertyDescriptor(p,'value').set.call(el,'1000'); el.dispatchEvent(new Event('input',{bubbles:true}))
})
await new Promise(r => setTimeout(r, 150))
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('保存并继续'))?.click())
await new Promise(r => setTimeout(r, 400))

// 回到概览，确认现金下降、本月支出不变
await page.goto(base + 'xiaojinku-v2.18.html#/', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 800))
const ov2 = await txt()
const cash2 = (() => { const i = ov2.indexOf('现金'); const m = ov2.slice(i, i+40).match(/¥([\d,]+\.\d{2})/); return m?m[1]:null })()
const expOfMonth = (() => { const i = ov2.indexOf('本月支出'); const m = ov2.slice(i, i+60).match(/¥([\d,]+\.\d{2})/); return m?m[1]:null })()
console.log('after transfer: 现金=', cash2, '(应 =', (parse(cash)-1000).toFixed(2), ')', '| 本月支出=', expOfMonth)
console.log('JS_ERRORS:', errs.length ? errs.join(' | ') : 'none')
await browser.close(); server.close()

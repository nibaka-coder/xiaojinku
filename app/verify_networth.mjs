import puppeteer from 'puppeteer-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve('dist')
const MIME = { '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  if (req.url.includes('favicon')) { res.writeHead(204); res.end(); return }
  const f = path.join(root, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]))
  fs.readFile(f, (e, buf) => { if (e) { res.writeHead(404); res.end('nf'); return } res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] ?? 'text/html; charset=utf-8' }); res.end(buf) })
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/`
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
const errs = []
page.on('pageerror', e => errs.push(e.message))
const txt = async () => page.evaluate(() => document.querySelector('main')?.innerText.replace(/\n/g, ' | ') || '')

// 1) 概览：净资产 = 现金 + 券商现金 + 投资市值 − 信用负债 − 长期负债
// 注：概览格子用 compact（万）显示、净资产是完整数字，两者单位不一致，
// 这里只打印供参考；精确的守恒校验见 verify_invest_dividend.mjs（纯函数级）。
await page.goto(base + 'index.html#/', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 900))
const ov = await txt()
console.log('OVERVIEW has 投资市值:', ov.includes('投资市值'))
// 抽取数字
const nums = ov.match(/¥[\d,]+\.\d{2}/g) || []
console.log('OVERVIEW first numbers:', nums.slice(0, 6).join('  '))
// 找 净资产 / 现金 / 投资市值 / 信用负债 / 长期负债 对应的数字
// 概览格子用 compact 显示（如 ¥8.5万），正则必须认单位，否则会把「1.01万」读成 1.01
function pick(label) {
  const i = ov.indexOf(label)
  if (i < 0) return null
  const seg = ov.slice(i, i + 60)
  const m = seg.match(/¥([\d,]+(?:\.\d+)?)\s*(万|亿)?/)
  if (!m) return null
  const v = parseFloat(m[1].replace(/,/g, '')) * (m[2] === '万' ? 10000 : m[2] === '亿' ? 1e8 : 1)
  return v.toFixed(2)
}
const nw = pick('净资产'), cash = pick('现金'), icash = pick('券商现金'), inv = pick('投资市值'), credit = pick('信用负债'), liab = pick('长期负债')
console.log('净资产=', nw, '现金=', cash, '券商现金=', icash, '投资市值=', inv, '信用=', credit, '长期=', liab)
const parse = s => s ? parseFloat(s.replace(/,/g, '')) : NaN
const nearEq = (a, b, eps = 1) => Math.abs(a - b) < eps
const sum = parse(cash) + parse(icash) + parse(inv) - parse(credit) - parse(liab)
console.log('现金+券商现金+投资−信用−长期 =', sum.toFixed(2), '| 净资产 =', parse(nw).toFixed(2), '（单位不一致，仅供肉眼参考）')

// 2) 记账页有 投资转账 模式
await page.goto(base + 'index.html#/add', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 600))
const modes = await page.evaluate(() => [...document.querySelectorAll('.seg-item')].map(b => b.textContent.trim()))
console.log('ADD modes:', JSON.stringify(modes))

// 3) 记一笔投资转出：应减少现金、不计入本月支出
await page.evaluate(() => [...document.querySelectorAll('.seg-item')].find(b => b.textContent.trim() === '转账')?.click())
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
await page.goto(base + 'index.html#/', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 800))
const ov2 = await txt()
const pick2 = (label) => {
  const i = ov2.indexOf(label)
  if (i < 0) return null
  const m = ov2.slice(i, i + 60).match(/¥([\d,]+(?:\.\d+)?)\s*(万|亿)?/)
  if (!m) return null
  return (parseFloat(m[1].replace(/,/g, '')) * (m[2] === '万' ? 10000 : m[2] === '亿' ? 1e8 : 1)).toFixed(2)
}
const cash2 = pick2('现金')
const expOfMonth = pick2('本月支出')
const expBefore = pick('本月支出')
// 概览格子是 compact（万）显示，精度到 0.1 万；只断言方向与「支出不受影响」
console.log('after transfer: 现金=', cash2, '(转账前 =', cash, ')', '| 本月支出=', expOfMonth, '(转账前 =', expBefore, ')')
console.log('现金下降:', parse(cash2) < parse(cash) ? 'PASS' : 'FAIL', '| 转账不计入本月支出:', nearEq(parse(expOfMonth), parse(expBefore)) ? 'PASS' : 'FAIL')
console.log('JS_ERRORS:', errs.length ? errs.join(' | ') : 'none')
await browser.close(); server.close()

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
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(buf)
  })
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/`
const FILE = 'index.html'

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--no-sandbox'],
})
const page = await browser.newPage()
const errs = []
page.on('pageerror', e => errs.push(e.message))
page.on('dialog', async d => { await d.accept() }) // auto-accept delete confirms

const waitText = async (needle, timeout = 8000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const txt = await page.evaluate(() => document.querySelector('main')?.innerText || '')
    if (txt.includes(needle)) return txt
    await new Promise(r => setTimeout(r, 200))
  }
  return await page.evaluate(() => document.querySelector('main')?.innerText || '')
}
const setInput = async (placeholder, val) => {
  const ok = await page.evaluate((ph, v) => {
    const inp = [...document.querySelectorAll('input')].find(i => (i.placeholder || '') === ph)
    if (!inp) return false
    const proto = Object.getPrototypeOf(inp)
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    setter.call(inp, String(v))
    inp.dispatchEvent(new Event('input', { bubbles: true }))
    inp.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }, placeholder, val)
  if (!ok) throw new Error('input not found: ' + placeholder)
}
const clickByText = async (text) => {
  const ok = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('button, a, div')].find(e => e.innerText && e.innerText.trim() === t && e.offsetParent !== null)
    if (el) { el.click(); return true }
    return false
  }, text)
  if (!ok) throw new Error('click not found: ' + text)
}

console.log('--- 1) 现有 USD / A股 持仓应正常（无回归）---')
await page.goto(base + FILE + '#/invest/holdings', { waitUntil: 'networkidle2' })
await waitText('持仓总览')
let txt = await page.evaluate(() => document.querySelector('main').innerText)
console.log('茅台市值含 ¥168,500:', txt.includes('168,500'))
console.log('苹果市值含 ¥81,880:', txt.includes('81,880'))

console.log('--- 2) 新建港股并买入，验证 HKD 汇率换算 ---')
await page.goto(base + FILE + '#/invest/add', { waitUntil: 'networkidle2' })
await waitText('记一笔投资')
await clickByText('＋ 新建')
await setInput('代码，如 600519 / AAPL', '00700')
await setInput('名称（留空用代码）', '腾讯控股')
await clickByText('港股')
await setInput('请输入股数', '100')
await setInput('0.00', '400') // 单价（原币 HKD）
await clickByText('保存')
await page.goto(base + FILE + '#/invest/holdings', { waitUntil: 'networkidle2' })
txt = await waitText('腾讯控股')
console.log('港股持仓出现:', txt.includes('腾讯控股'))
console.log('成本价显示 HK$400.00:', txt.includes('HK$400.00'))
// 市值 = 100 * 400 HKD * 0.915 = 36,600 CNY（用 USD 率会是 284,800，明显不同）
console.log('市值≈¥36,600（HKD率）:', txt.includes('36,600'), '（若误用USD率应见 284,800）')

console.log('--- 3) 证券删除入口：⋯ → 删除该证券，级联删交易 ---')
// 在「腾讯控股」卡片内精确点击管理按钮（持仓按市值排序，首个 ⋯ 属于茅台）
await page.evaluate(() => {
  const cards = [...document.querySelectorAll('main .card-2')]
  const card = cards.find(c => c.innerText.includes('腾讯控股'))
  if (!card) throw new Error('未找到腾讯控股卡片')
  const btn = card.querySelector('button[aria-label="管理证券"]')
  btn.click()
})
await waitText('证券管理')
txt = await page.evaluate(() => document.querySelector('main').innerText)
console.log('弹窗显示证券管理 + 交易笔数:', txt.includes('证券管理') && txt.includes('笔交易'))
await clickByText('删除该证券')
await new Promise(r => setTimeout(r, 800))
await page.evaluate(() => { location.hash = '#/overview' })
await new Promise(r => setTimeout(r, 300))
await page.evaluate(() => { location.hash = '#/invest/holdings' })
txt = await waitText('持仓总览')
console.log('删除后腾讯控股消失:', !txt.includes('腾讯控股'))
console.log('茅台仍在（删的是腾讯）:', txt.includes('贵州茅台'))

console.log('--- 4) 设置页 HKD 汇率输入存在 ---')
await page.goto(base + FILE + '#/settings', { waitUntil: 'networkidle2' })
txt = await waitText('HKD 当前')
console.log('设置页含 HKD 汇率:', txt.includes('HKD 当前') || txt.includes('HKD'))

console.log('\\nJS_ERRORS:', errs.length ? errs.join(' | ') : 'none')
await browser.close()
server.close()

// 投资模块专项验证：分红计入净资产 / 回收去重 / 送股摊薄 / 双成本口径
// Part A：calc 纯函数（esbuild 编译后在 node 里跑）
// Part B：真渲染（无头 Chrome 加载 dist，检查不白屏 + 入口存在）
import esbuild from 'esbuild'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import http from 'node:http'
import { pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ''}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`)
  }
}
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps

// ===== Part A：纯函数 =====
const out = path.join(os.tmpdir(), `calc_${Date.now()}.mjs`)
await esbuild.build({
  entryPoints: ['src/lib/calc.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  alias: { '@': path.resolve('src') },
})
const C = await import(pathToFileURL(out).href)

const FX = 7.1
const HKD = 0.915
const now = '2026-01-01T00:00:00.000Z'
const mkTxn = (o) => ({
  id: o.id ?? 't' + Math.random(),
  datetime: o.datetime ?? now,
  type: o.type ?? 'expense',
  amount: o.amount ?? 0,
  currency: 'CNY',
  fund_source: o.fund_source ?? 'cash',
  is_investment_transfer: o.is_investment_transfer,
  created_at: now,
  updated_at: now,
})
const mkInv = (o) => ({
  id: o.id ?? 'i' + Math.random(),
  security_id: o.security_id ?? 's1',
  type: o.type,
  datetime: o.datetime ?? now,
  shares: o.shares ?? 0,
  price: o.price ?? 0,
  fee: o.fee ?? 0,
  currency: o.currency ?? 'CNY',
  created_at: now,
  updated_at: now,
})
const SEC = {
  id: 's1',
  code: '600519',
  name: '测试股',
  market: 'ashare',
  currency: 'CNY',
  secid: '1.600519',
  lastPrice: 80,
  created_at: now,
}

console.log('\n=== A1) dividendAmount：fee 是代扣税，应当「减」不应当「加」===')
{
  // 100 股 × 每股 5 元 = 税前 500，代扣税 50 → 到手 450（旧实现写成 550）
  const net = C.dividendAmount({ shares: 100, price: 5, fee: 50 })
  ok('到手 = 500 − 50 = 450', near(net, 450), `实际 ${net}`)
  const gross = C.dividendGross({ shares: 100, price: 5, fee: 50 })
  ok('税前 = 500', near(gross, 500), `实际 ${gross}`)
}

console.log('\n=== A2) 送股 / 拆股：股数增加、总成本不变 → 每股成本摊薄 ===')
{
  const txns = [
    mkInv({ type: 'buy', shares: 1000, price: 100, fee: 0 }),
    mkInv({ type: 'split', shares: 1000 }), // 10 送 10
  ]
  const h = C.deriveHolding(SEC, txns, FX, HKD)
  ok('股数 1000 → 2000', h.shares === 2000, `实际 ${h.shares}`)
  ok('总成本仍是 100000', near(h.costOrig, 100000), `实际 ${h.costOrig}`)
  ok('每股成本 100 → 50', near(h.avgCost, 50), `实际 ${h.avgCost}`)
}

console.log('\n=== A3) 送股后卖光：已实现盈亏不能虚增（送来的股不能当零成本批次）===')
{
  const txns = [
    mkInv({ type: 'buy', shares: 1000, price: 100, fee: 0 }),
    mkInv({ type: 'split', shares: 1000 }),
    mkInv({ type: 'sell', shares: 2000, price: 150, fee: 0 }),
  ]
  const lots = C.deriveLots([SEC], txns, FX, HKD)
  // 投入 100000，卖出 2000×150 = 300000 → 利润 200000
  ok('已实现盈亏 = 200000', near(lots.totalRealizedCNY, 200000), `实际 ${lots.totalRealizedCNY}`)
}

console.log('\n=== A4) 分红现金计入净资产 + 与「回收」去重（核心推演）===')
{
  const sec = { ...SEC }
  const base = { cashOpening: 10000, liabilities: [], securities: [sec], investTxns: [] }

  const nw0 = C.netWorth([], [], 10000, [sec], [], FX, HKD)
  ok('① 初始净资产 10000', near(nw0, 10000), `实际 ${nw0}`)

  // 转出 10000（银行卡 → 券商）
  const t1 = [mkTxn({ type: 'expense', amount: 10000, fund_source: 'cash', is_investment_transfer: true })]
  const nw1 = C.netWorth(t1, [], 10000, [sec], [], FX, HKD)
  ok('② 转出后仍 10000', near(nw1, 10000), `实际 ${nw1}`)
  ok('② 券商现金 = 10000', near(C.investCashBalance(t1, [], FX, HKD), 10000))

  // 买入 100 股 @80
  const i1 = [mkInv({ type: 'buy', shares: 100, price: 80, fee: 0 })]
  const nw2 = C.netWorth(t1, [], 10000, [sec], i1, FX, HKD)
  ok('③ 买入后仍 10000', near(nw2, 10000), `实际 ${nw2}`)
  ok('③ 券商现金 = 2000', near(C.investCashBalance(t1, i1, FX, HKD), 2000))

  // 分红：每股 5 元，100 股，代扣税 10%（税 50，到手 450）
  const i2 = [...i1, mkInv({ type: 'dividend', shares: 100, price: 5, fee: 50 })]
  const secEx = { ...sec, lastPrice: 75 } // 除权后股价 80 − 5
  const nw3 = C.netWorth(t1, [], 10000, [secEx], i2, FX, HKD)
  // 预期：0(银行卡) + 2450(券商) + 7500(市值) = 9950，比初始少 50 = 分红税（真实损失）
  ok('④ 分红后 = 9950（少 50 是税）', near(nw3, 9950), `实际 ${nw3}`)
  ok('④ 券商现金 = 2450（含分红）', near(C.investCashBalance(t1, i2, FX, HKD), 2450))

  // 回收 2450（券商 → 银行卡）：只搬运不应改变净资产
  const t2 = [
    ...t1,
    mkTxn({ type: 'income', amount: 2450, is_investment_transfer: true }),
  ]
  const nw4 = C.netWorth(t2, [], 10000, [secEx], i2, FX, HKD)
  ok('⑤ 回收后净资产不变（不重复计）', near(nw4, nw3), `${nw3} → ${nw4}`)
  ok('⑤ 银行卡 +2450', near(C.cashBalance(t2, 10000), 2450), `实际 ${C.cashBalance(t2, 10000)}`)
  ok('⑤ 券商现金归 0', near(C.investCashBalance(t2, i2, FX, HKD), 0), `实际 ${C.investCashBalance(t2, i2, FX, HKD)}`)
}

console.log('\n=== A5) 双成本口径：成本不同，净资产必须相同 ===')
{
  const sec = { ...SEC, lastPrice: 75 }
  const txns = [
    mkInv({ type: 'buy', shares: 100, price: 80, fee: 0 }),
    mkInv({ type: 'dividend', shares: 100, price: 5, fee: 50 }),
  ]
  const a = C.deriveHolding(sec, txns, FX, HKD, 'actual')
  const b = C.deriveHolding(sec, txns, FX, HKD, 'amortized')
  ok('口径A 成本 = 8000（真实投入）', near(a.costCNY, 8000), `实际 ${a.costCNY}`)
  ok('口径B 成本 = 7550（扣分红）', near(b.costCNY, 7550), `实际 ${b.costCNY}`)
  ok('口径A 浮动盈亏 = −500', near(a.profitCNY, -500), `实际 ${a.profitCNY}`)
  ok('口径B 浮动盈亏 = −50', near(b.profitCNY, -50), `实际 ${b.profitCNY}`)
  ok('两者市值相同', near(a.marketValueCNY, b.marketValueCNY))
  const t = [mkTxn({ type: 'expense', amount: 10000, fund_source: 'cash', is_investment_transfer: true })]
  const nwA = C.netWorth(t, [], 10000, [sec], txns, FX, HKD)
  ok('净资产与口径无关 = 9950', near(nwA, 9950), `实际 ${nwA}`)
}

console.log('\n=== A6) 摊薄成本为负时盈亏率不出现天文数字 ===')
{
  const sec = { ...SEC, lastPrice: 100 }
  const txns = [
    mkInv({ type: 'buy', shares: 100, price: 80, fee: 0 }),
    mkInv({ type: 'dividend', shares: 100, price: 100, fee: 0 }), // 累计分红 10000 > 成本 8000
  ]
  const b = C.deriveHolding(sec, txns, FX, HKD, 'amortized')
  ok('摊薄成本为负', b.costCNY < 0, `实际 ${b.costCNY}`)
  ok('盈亏率按 0 展示（不是天文数字）', b.profitPct === 0, `实际 ${b.profitPct}`)
  ok('浮动盈亏仍正确 = 10000+2000', near(b.profitCNY, 12000), `实际 ${b.profitCNY}`)
}

console.log('\n=== A7) 登记日持股数推导（送股也计入）===')
{
  const txns = [
    mkInv({ type: 'buy', shares: 1000, datetime: '2024-01-01T00:00:00' }),
    mkInv({ type: 'split', shares: 1000, datetime: '2024-06-01T00:00:00' }),
  ]
  const before = C.sharesHeldAt('s1', txns, new Date('2024-03-01').getTime())
  const after = C.sharesHeldAt('s1', txns, new Date('2024-09-01').getTime())
  ok('送股前持股 1000', before === 1000, `实际 ${before}`)
  ok('送股后持股 2000', after === 2000, `实际 ${after}`)
  ok('最早建仓时间 = 2024-01-01', C.firstBuyTs('s1', txns) === new Date('2024-01-01T00:00:00').getTime())
}

console.log('\n=== A8) A股差别化红利税分档 ===')
{
  const { defaultTaxRate } = await import(
    pathToFileURL(
      await (async () => {
        const o2 = path.join(os.tmpdir(), `ds_${Date.now()}.mjs`)
        await esbuild.build({
          entryPoints: ['src/lib/dividendService.ts'],
          bundle: true, format: 'esm', platform: 'node', outfile: o2,
          alias: { '@': path.resolve('src') },
        })
        return o2
      })()
    ).href
  )
  const secAshare = { ...SEC }
  const day = 86400000
  const base = new Date('2024-01-01').getTime()
  ok('持股 ≤1 月 → 20%', near(defaultTaxRate(secAshare, base + 10 * day, base), 0.2))
  ok('持股 1 月~1 年 → 10%', near(defaultTaxRate(secAshare, base + 100 * day, base), 0.1))
  ok('持股 >1 年 → 免税', near(defaultTaxRate(secAshare, base + 400 * day, base), 0))
  ok('美股 → 10%', near(defaultTaxRate({ ...SEC, market: 'us' }, base, base), 0.1))
  ok('港股 → 10%', near(defaultTaxRate({ ...SEC, market: 'hk' }, base, base), 0.1))
  ok('ETF → 免税', near(defaultTaxRate({ ...SEC, market: 'etf' }, base, base), 0))
}

// ===== Part B：真渲染 =====
console.log('\n=== B) 真渲染（dist 单文件，无头 Chrome）===')
const root = path.resolve('dist')
const MIME = {
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}
const server = http.createServer((req, res) => {
  if (req.url.includes('favicon')) {
    res.writeHead(204)
    res.end()
    return
  }
  const clean = decodeURIComponent(req.url.split('?')[0].split('#')[0])
  const f = path.join(root, clean === '' || clean === '/' ? 'index.html' : clean)
  fs.readFile(f, (e, buf) => {
    if (e) {
      res.writeHead(404)
      res.end('nf')
      return
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] ?? 'text/html; charset=utf-8' })
    res.end(buf)
  })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/`

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.setViewport({ width: 1280, height: 900 })

await page.goto(base + '#/', { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1200))
const len = await page.evaluate(() => document.getElementById('root')?.innerHTML.length ?? 0)
ok('首页渲染非空', len > 0, `root 长度 ${len}`)
ok('无 pageerror', errors.length === 0, errors.join(' | '))

// 投资管理分组默认折叠，先展开再检查子项
const expandedOk = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    (b.textContent || '').includes('投资管理')
  )
  if (!btn) return false
  btn.click()
  return true
})
await new Promise((r) => setTimeout(r, 600))
const navText = await page.evaluate(() => document.querySelector('aside')?.innerText ?? document.body.innerText)
ok('侧边栏可展开投资管理', expandedOk)
ok('侧边栏有「分红助手」', navText.includes('分红助手'), navText.replace(/\n/g, ' | ').slice(0, 120))

const ovText = await page.evaluate(() => document.querySelector('main')?.innerText ?? '')
ok('概览页有「券商现金」格子', ovText.includes('券商现金'))

await page.goto(base + '?t=' + Date.now() + '#/invest/dividends', { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 2500))
const divLen = await page.evaluate(() => document.getElementById('root')?.innerHTML.length ?? 0)
const divText = await page.evaluate(() => document.querySelector('main')?.innerText ?? '')
ok('分红助手页渲染非空', divLen > 0, `root 长度 ${divLen}`)
ok('分红助手标题存在', divText.includes('分红助手'), divText.slice(0, 80).replace(/\n/g, ' | '))

await page.goto(base + '?t=' + Date.now() + '#/settings', { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1200))
const setText = await page.evaluate(() => document.querySelector('main')?.innerText ?? '')
ok('设置页有「持仓成本口径」', setText.includes('持仓成本口径'))
ok('设置页有「真实成本」选项', setText.includes('真实成本'))
ok('设置页有「摊薄成本」选项', setText.includes('摊薄成本'))

await page.goto(base + '?t=' + Date.now() + '#/invest/holdings', { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1500))
const holdText = await page.evaluate(() => document.querySelector('main')?.innerText ?? '')
ok('持仓页有分红助手入口', holdText.includes('分红助手'))

ok('全程无 pageerror', errors.length === 0, errors.join(' | '))

await browser.close()
server.close()

console.log(`\n结果: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

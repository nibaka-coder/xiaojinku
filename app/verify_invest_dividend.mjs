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

console.log('\n=== A4) 券商里的钱不计入净资产（v2.25 口径）+ 回收即回补 ===')
{
  // 口径：净资产 = 银行卡现金 + 投资市值 − 负债。
  // 券商账户里的可取现金（转出未买、分红到账未转出）不单独计一项 ——
  // 一旦买入（回到市值）或回收到银行卡即自动回补，不会永久漏算。
  const sec = { ...SEC }

  const nw0 = C.netWorth([], [], 10000, [sec], [], FX, HKD)
  ok('① 初始净资产 10000', near(nw0, 10000), `实际 ${nw0}`)

  // 转出 10000（银行卡 → 券商）：钱离开银行卡但未买入 → 暂不计入
  const t1 = [mkTxn({ type: 'expense', amount: 10000, fund_source: 'cash', is_investment_transfer: true })]
  const nw1 = C.netWorth(t1, [], 10000, [sec], [], FX, HKD)
  ok('② 转出未买入 → 暂不计入（=0）', near(nw1, 0), `实际 ${nw1}`)

  // 买入 100 股 @80：钱变成股票 → 回到净资产
  const i1 = [mkInv({ type: 'buy', shares: 100, price: 80, fee: 0 })]
  const sec80 = { ...sec, lastPrice: 80 }
  const nw2 = C.netWorth(t1, [], 10000, [sec80], i1, FX, HKD)
  ok('③ 买入后 = 市值 8000', near(nw2, 8000), `实际 ${nw2}`)

  // 分红：每股 5 元，100 股，代扣税 10%（税 50，到手 450）；除权后股价 75
  const i2 = [...i1, mkInv({ type: 'dividend', shares: 100, price: 5, fee: 50 })]
  const secEx = { ...sec, lastPrice: 75 }
  const nw3 = C.netWorth(t1, [], 10000, [secEx], i2, FX, HKD)
  ok('④ 分红到账未转出 → 只有市值 7500', near(nw3, 7500), `实际 ${nw3}`)

  // 回收 2450（券商 → 银行卡）：券商现金回到银行卡 → 净资产回补到真实值 9950
  const t2 = [...t1, mkTxn({ type: 'income', amount: 2450, is_investment_transfer: true })]
  const nw4 = C.netWorth(t2, [], 10000, [secEx], i2, FX, HKD)
  // 真实净资产 = 0(银行卡转出后) + 2450(回收) + 7500(市值) = 9950，比初始少 50 = 分红税（真实损失）
  ok('⑤ 回收后回补到 9950（少 50 是税）', near(nw4, 9950), `实际 ${nw4}`)
  ok('⑤ 银行卡 +2450', near(C.cashBalance(t2, 10000), 2450), `实际 ${C.cashBalance(t2, 10000)}`)
  ok('⑤ 回补额 = 券商现金 2450', near(nw4 - nw3, 2450), `回补 ${nw4 - nw3}`)
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
  // 新口径：银行卡 0 + 市值 7500（券商现金不计）
  ok('净资产与口径无关 = 7500', near(nwA, 7500), `实际 ${nwA}`)
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

console.log('\n=== A9) 转账记录不完整也不再影响净资产（取消券商现金项后的收益）===')
{
  // 场景：记账前券商里已有 5.7 万本金，转账只记了 6.3 万，却买了 12 万。
  // 旧口径会推导出 −5.7 万的「券商现金」并拉低净资产；新口径不看券商现金，
  // 只要股票还在（市值 12 万），净资产就是对的。
  const t = [mkTxn({ type: 'expense', amount: 63000, is_investment_transfer: true })]
  const inv = [mkInv({ type: 'buy', shares: 1000, price: 120, fee: 0 })]
  const sec = { ...SEC, id: 's1', currency: 'CNY', lastPrice: 120 }

  const nw = C.netWorth(t, [], 200000, [sec], inv, FX, HKD)
  // 银行卡 200000 − 63000 = 137000 + 市值 120000 = 257000
  ok('转账记少了也不影响净资产', near(nw, 257000), `实际 ${nw}`)

  const months = ['2026-01', '2026-02']
  const tr = C.netWorthTrend(months, t, [], 200000, [sec], inv, FX, HKD)
  ok('走势同样不受影响', tr.every((p) => p.net === nw), JSON.stringify(tr.map((p) => p.net)))
  ok('走势 cash 项即银行卡现金', near(tr[0].cash, 137000), `实际 ${tr[0].cash}`)
}

console.log('\n=== A10) 交易金额：买入含费、卖出扣费（与已实现盈亏口径一致）===')
{
  ok('买入 = 股数×价 + 手续费', near(C.investTxnAmount({ type: 'buy', shares: 100, price: 80, fee: 12 }), 8012))
  ok('卖出 = 股数×价 − 手续费', near(C.investTxnAmount({ type: 'sell', shares: 100, price: 80, fee: 12 }), 7988))
  ok('无费时买卖同额', near(C.investTxnAmount({ type: 'sell', shares: 100, price: 80, fee: 0 }), 8000))
  ok('送股金额为 0', near(C.investTxnAmount({ type: 'split', shares: 100, price: 0, fee: 0 }), 0))

  // 与 deriveLots 的已实现盈亏对账：卖出到手 − 买入成本 = 已实现盈亏
  const sec = { ...SEC, id: 's1', currency: 'CNY', lastPrice: 100 }
  const inv = [
    mkInv({ type: 'buy', shares: 100, price: 80, fee: 10 }), // 成本 8010，每股 80.1
    mkInv({ type: 'sell', shares: 100, price: 90, fee: 15 }), // 到手 8985
  ]
  const d = C.deriveLots([sec], inv, FX, HKD)
  const realized = d.sells[inv[1].id].realizedPL
  const proceeds = C.investTxnAmount(inv[1])
  const cost = C.investTxnAmount(inv[0])
  ok('已实现盈亏 = 卖出到手 − 买入成本', near(realized, proceeds - cost), `${proceeds} − ${cost} = ${proceeds - cost}，实际 ${realized}`)
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
ok('概览页已无「券商现金」格子', !ovText.includes('券商现金'))
ok(
  '概览四子项齐全（现金/投资市值/信用负债/长期负债）',
  ['现金', '投资市值', '信用负债', '长期负债'].every((k) => ovText.includes(k))
)

await page.goto(base + '?t=' + Date.now() + '#/invest/dividends', { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 2500))
const divLen = await page.evaluate(() => document.getElementById('root')?.innerHTML.length ?? 0)
const divText = await page.evaluate(() => document.querySelector('main')?.innerText ?? '')
ok('分红助手页渲染非空', divLen > 0, `root 长度 ${divLen}`)
ok('分红助手标题存在', divText.includes('分红助手'), divText.slice(0, 80).replace(/\n/g, ' | '))

// 设置页已改为「分组菜单 + 子页」：首页只列入入口，具体设置进子页
await page.goto(base + '?t=' + Date.now() + '#/settings', { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1200))
const setText = await page.evaluate(() => document.querySelector('main')?.innerText ?? '')
ok('设置首页是分组菜单', setText.includes('数据与资产') && setText.includes('偏好') && setText.includes('同步'))
ok('设置首页无「券商期初现金」', !setText.includes('券商期初现金'))
ok(
  '设置首页含九个入口',
  ['资产负债', '长期负债', '分类管理', '数据备份与导入', '外观', '应用锁', '汇率', '投资设置', '云同步'].every(
    (k) => setText.includes(k)
  ),
  setText.replace(/\n/g, ' | ').slice(0, 160)
)

await page.goto(base + '?t=' + Date.now() + '#/settings/invest', { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1000))
const investText = await page.evaluate(() => document.querySelector('main')?.innerText ?? '')
ok('投资设置子页有「持仓成本口径」', investText.includes('持仓成本口径'))
ok('投资设置子页有「真实成本」选项', investText.includes('真实成本'))
ok('投资设置子页有「摊薄成本」选项', investText.includes('摊薄成本'))

await page.goto(base + '?t=' + Date.now() + '#/invest/trades', { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1500))
const tradeText = await page.evaluate(() => document.querySelector('main')?.innerText ?? '')
ok('记录页已无分红筛选', !tradeText.includes('分红'))
ok('记录页按月份分组', /\d{4}年\d{1,2}月/.test(tradeText), tradeText.slice(0, 80).replace(/\n/g, ' | '))

await page.goto(base + '?t=' + Date.now() + '#/invest/holdings', { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1500))
const holdText = await page.evaluate(() => document.querySelector('main')?.innerText ?? '')
ok('持仓页已移除「记一笔投资」按钮', !holdText.includes('记一笔投资'))

ok('全程无 pageerror', errors.length === 0, errors.join(' | '))

await browser.close()
server.close()

console.log(`\n结果: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

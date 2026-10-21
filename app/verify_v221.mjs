import puppeteer from 'puppeteer-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('dist')
const FILE = 'xiaojinku-v2.19.html'
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

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
const errs = []
page.on('pageerror', e => errs.push(e.message))
page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text()) })

const waitText = (substr, timeout = 10000) => new Promise((resolve, reject) => {
  const t0 = Date.now()
  const iv = setInterval(async () => {
    const txt = await page.evaluate(() => document.body.innerText || '')
    if (txt.includes(substr)) { clearInterval(iv); resolve(txt) }
    else if (Date.now() - t0 > timeout) { clearInterval(iv); reject(new Error('timeout waiting: ' + substr)) }
  }, 200)
})
const bodyText = () => page.evaluate(() => document.body.innerText || '')
const clickByText = async (text) => {
  const ok = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('button, a, div, label')]
    const el = els.find(e => e.innerText && e.innerText.trim() === t)
    if (el) { el.click(); return true } return false
  }, text)
  if (!ok) throw new Error('click not found: ' + text)
}
let pass = 0, fail = 0
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); cond ? pass++ : fail++ }

// ===== 1) 净资产走势图（统计页，需 近3月 以上） =====
await page.goto(base + FILE + '#/statistics', { waitUntil: 'networkidle2' })
await waitText('统计')
let txt = await bodyText()
check('单月时提示选择更长区间', txt.includes('选择更长时间区间'))
// 切到近6月
await clickByText('近6月')
await new Promise(r => setTimeout(r, 1200))
txt = await bodyText()
check('出现「净资产走势」模块', txt.includes('净资产走势'))
check('走势图有预算说明（投资按当前价估算）', txt.includes('当月持股 × 当前价'))
// 检查 ECharts 画布渲染（净资产走势 canvas 数量应为 3：趋势/饼图/净资产）
const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length)
check('净资产走势图已渲染（canvas 数 ≥ 3，实际 ' + canvasCount + '）', canvasCount >= 3)
// 趋势卡片应展示区间变化金额
const hasDelta = /净资产走势\n[^\n]*[+−-]?¥[\d,]+/.test(txt)
check('净资产走势标题旁显示区间增减', hasDelta)

// ===== 2) 支出排行 TOP10（按单笔流水，不按分类） =====
txt = await bodyText()
check('出现「支出排行 TOP10」模块', txt.includes('支出排行 TOP10'))
// 排行项应为具体流水条目（含日期与金额），且条数 ≤ 10
const rankRows = await page.evaluate(() => {
  const secs = [...document.querySelectorAll('section.card')]
  const sec = secs.find(s => s.innerText.includes('支出排行 TOP10'))
  if (!sec) return []
  return [...sec.querySelectorAll('div.flex.items-center.gap-3')].map(d => d.innerText.replace(/\n/g, ' | '))
})
console.log('排行样例:', rankRows.slice(0, 3))
check('排行列出单笔流水（≥1 条，实际 ' + rankRows.length + '）', rankRows.length >= 1)
check('排行条数不超过 10', rankRows.length <= 10)
// 金额应降序
const amounts = rankRows.map(r => {
  const m = r.match(/¥([\d,]+\.\d{2})/)
  return m ? parseFloat(m[1].replace(/,/g, '')) : 0
})
const sorted = amounts.every((v, i) => i === 0 || amounts[i - 1] >= v)
check('排行按金额降序', sorted)

// ===== 3) 行情更新时间 + 并发取价 =====
await page.goto(base + FILE + '#/invest/holdings', { waitUntil: 'networkidle2' })
await waitText('持仓总览')
txt = await bodyText()
check('持仓页显示行情时间（初始为尚未获取/已更新）', /行情更新于|尚未获取行情/.test(txt))
await clickByText('↻ 刷新行情')
let refreshed = false
for (let i = 0; i < 40; i++) {
  await new Promise(r => setTimeout(r, 500))
  txt = await bodyText()
  if (txt.includes('刷新中')) continue
  refreshed = true
  break
}
check('刷新完成（按钮复位）', refreshed)
txt = await bodyText()
check('刷新后显示「行情更新于 刚刚/分钟前」', /行情更新于 (刚刚|\d+ 分钟前|\d+ 小时前|\d{2}-\d{2} \d{2}:\d{2})/.test(txt))
const mv = (txt.match(/持仓市值\n¥([\d,]+\.\d{2})/) || [])[1]
check('刷新后持仓市值 > 0（并发取价生效）¥' + mv, mv && parseFloat(mv.replace(/,/g, '')) > 0)

// ===== 4) 代码整洁：占位页已删、建仓枚举已移除 =====
const html = fs.readFileSync(path.join(root, FILE), 'utf8')
check('产物中已无「目标预算/占位页」相关空壳', !html.includes('敬请期待') && !html.includes('储蓄进度'))
await page.goto(base + FILE + '#/settings', { waitUntil: 'networkidle2' })
await waitText('长期负债')
txt = await bodyText()
check('负债编辑已无「年化利率」字段', !txt.includes('年化利率'))

// 外部行情接口偶发空响应属于预期降级噪音（并发竞速会自动用另一通道），与 app 报错区分
const netNoise = errs.filter((e) => e.includes('Failed to load resource'))
const appErrs = errs.filter((e) => !e.includes('Failed to load resource'))
check('应用无 JS 报错', appErrs.length === 0)
console.log('（外部接口网络噪音 ' + netNoise.length + ' 条，由并发竞速自动降级，不影响取价）')
if (appErrs.length) console.log('ERRORS:', appErrs.join(' | '))
console.log(`\n结果: ${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail ? 1 : 0)

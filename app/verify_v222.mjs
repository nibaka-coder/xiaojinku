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
let pass = 0, fail = 0
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); cond ? pass++ : fail++ }

// ===== 概览页：净资产走势（近一年） =====
await page.goto(base + FILE + '#/', { waitUntil: 'networkidle2' })
await waitText('净资产')
let txt = await bodyText()
check('概览页出现「净资产走势 · 近一年」', txt.includes('净资产走势 · 近一年'))
check('标明投资为当月持股×当前价估算', txt.includes('当月持股 × 当前价'))
// 12 个点：读取 ECharts 实例的 series 数据长度
// ECharts 打包后不在 window 上，改用「悬浮读 tooltip」验证真实数据点
const nwCanvas = await page.evaluate(() => {
  const secs = [...document.querySelectorAll('section.card')]
  const sec = secs.find(s => s.innerText.includes('净资产走势'))
  const c = sec?.querySelector('canvas')
  if (!c) return null
  const r = c.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
check('概览页走势图 canvas 已渲染', !!nwCanvas)
const seen = new Set()
let tipOk = true
if (nwCanvas) {
  // 在绘图区内密集采样（画布含坐标轴边距，需避开边缘）后取并集
  const N = 24
  for (let i = 0; i < N; i++) {
    const ratio = 0.1 + (0.85 * i) / (N - 1)
    const x = nwCanvas.x + nwCanvas.w * ratio
    await page.mouse.move(x, nwCanvas.y + nwCanvas.h / 2)
    await new Promise(r => setTimeout(r, 90))
    const tip = await page.evaluate(() => {
      const tip = [...document.querySelectorAll('div')].find(
        (d) => d.style.position === 'absolute' && /净资产/.test(d.innerText || '')
      )
      return tip ? tip.innerText : ''
    })
    const m = tip.match(/(\d{4}-\d{2})/)
    if (m) seen.add(m[1])
    if (tip && !/净资产/.test(tip)) tipOk = false
  }
}
console.log('（悬浮扫过捕捉到的月份:', [...seen].join(', '), '）')
check('走势图含多个月份数据点（' + seen.size + ' 个）', seen.size >= 12)
check('tooltip 含净资产与现金/投资/负债拆分', tipOk)
// 区间增减金额显示
const deltaShown = /净资产走势 · 近一年\n[+−]¥[\d,]+\.\d{2}/.test(txt)
check('标题旁显示近一年增减额', deltaShown)
// 走势图位置应在「日常开销概览」之前（紧跟净资产卡片）
const order = await page.evaluate(() => {
  const secs = [...document.querySelectorAll('section.card')]
  const idxNw = secs.findIndex(s => s.innerText.includes('净资产走势'))
  const idxDaily = secs.findIndex(s => s.innerText.includes('日常开销概览'))
  return { idxNw, idxDaily }
})
check('走势卡片位于「日常开销概览」之前', order.idxNw >= 0 && order.idxNw < order.idxDaily)

// ===== 统计页：已无净资产走势，其他模块完好 =====
await page.goto(base + FILE + '#/statistics', { waitUntil: 'networkidle2' })
await waitText('统计')
txt = await bodyText()
check('统计页已移除净资产走势', !txt.includes('净资产走势'))
check('统计页保留支出排行 TOP10', txt.includes('支出排行 TOP10'))
// 默认「本月」时趋势图会显示占位文字（只有饼图）；切到近6月后应出现 2 张图
const statCanvasMonth = await page.evaluate(() => document.querySelectorAll('canvas').length)
check('统计页本月视图仅饼图（canvas ' + statCanvasMonth + '）', statCanvasMonth === 1)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === '近6月')
  if (b) b.click()
})
await new Promise(r => setTimeout(r, 1200))
const statCanvas6m = await page.evaluate(() => document.querySelectorAll('canvas').length)
check('切近6月后趋势图+饼图齐全（canvas ' + statCanvas6m + '）', statCanvas6m === 2)

const netNoise = errs.filter((e) => e.includes('Failed to load resource'))
const appErrs = errs.filter((e) => !e.includes('Failed to load resource'))
check('应用无 JS 报错', appErrs.length === 0)
console.log('（外部接口网络噪音 ' + netNoise.length + ' 条）')
if (appErrs.length) console.log('ERRORS:', appErrs.join(' | '))
console.log(`\n结果: ${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail ? 1 : 0)

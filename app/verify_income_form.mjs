// 记账页「收入模式精简」专项回归：
// 1) 收入模式不显示：资金来源 / 按区间摊销 / 商户(对方)
// 2) 支出模式这些字段照常显示（回归保护）
// 3) 模式按钮为 支出/收入/还款/转账，4 个按钮高度一致（不折行）
import puppeteer from 'puppeteer-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('dist')
const FILE = 'index.html'
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.css': 'text/css',
}
const server = http.createServer((req, res) => {
  if (req.url.includes('favicon')) { res.writeHead(204); res.end(); return }
  const f = path.join(root, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]))
  fs.readFile(f, (e, buf) => {
    if (e) { res.writeHead(404); res.end('nf'); return }
    res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); res.end(buf)
  })
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/`

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] })

let pass = 0, fail = 0
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); cond ? pass++ : fail++ }

const clickByText = (page, text) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll('button')].find(b => (b.innerText || '').includes(t))
    if (el) { el.click(); return true }
    return false
  }, text)

const page = await browser.newPage()
await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true })
const errs = []
page.on('pageerror', e => errs.push(e.message))
await page.goto(base + FILE + '#/add', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))

// ---------- 模式按钮：文案 + 不折行 ----------
// 注意：页面顶部导航也有 .seg，这里按「恰好 4 个 seg-item」定位模式切换那一排
const modeBtns = await page.evaluate(() => {
  const segs = [...document.querySelectorAll('.seg')]
  const seg = segs.find(s => s.querySelectorAll('.seg-item').length === 4)
  if (!seg) return null
  const items = [...seg.querySelectorAll('.seg-item')]
  return items.map(b => ({
    text: (b.innerText || '').trim(),
    h: Math.round(b.getBoundingClientRect().height),
    nowrap: getComputedStyle(b).whiteSpace === 'nowrap',
  }))
})
check('找到模式切换那一排（4 个按钮）', !!modeBtns && modeBtns.length === 4)
const labels = (modeBtns || []).map(b => b.text)
check('模式按钮文案为 支出/收入/还款/转账', JSON.stringify(labels) === JSON.stringify(['支出', '收入', '还款', '转账']))
const heights = (modeBtns || []).map(b => b.h)
const minH = Math.min(...heights), maxH = Math.max(...heights)
check('四个模式按钮高度一致（不折行）', heights.length === 4 && maxH - minH <= 2)
check('模式按钮已设 whitespace-nowrap', heights.length === 4 && (modeBtns || []).every(b => b.nowrap))

// ---------- 切到「收入」：三项应隐藏 ----------
await clickByText(page, '收入')
await new Promise(r => setTimeout(r, 600))
let txt = await page.evaluate(() => document.body.innerText)
check('收入模式·不显示「资金来源」', !txt.includes('资金来源'))
check('收入模式·不显示「按区间摊销」', !txt.includes('按区间摊销'))

// 展开「更多」，检查商户隐藏 / 日期+备注保留
await clickByText(page, '更多')
await new Promise(r => setTimeout(r, 600))
txt = await page.evaluate(() => document.body.innerText)
check('收入模式·不显示「商户 / 对方」', !txt.includes('商户'))
check('收入模式·保留「日期」', txt.includes('日期'))
check('收入模式·保留「备注」', txt.includes('备注'))

// ---------- 回归：切回「支出」三项应恢复 ----------
await clickByText(page, '支出')
await new Promise(r => setTimeout(r, 600))
txt = await page.evaluate(() => document.body.innerText)
check('支出模式·显示「资金来源」（回归保护）', txt.includes('资金来源'))
check('支出模式·显示「按区间摊销」（回归保护）', txt.includes('按区间摊销'))
check('支出模式·显示「商户 / 对方」（回归保护）', txt.includes('商户'))

check('全程无 JS 报错', errs.length === 0)
if (errs.length) console.log(errs.join('\n'))

await browser.close()
server.close()
console.log(`\n结果: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

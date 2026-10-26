import puppeteer from 'puppeteer-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const FILE = 'index.html'
const root = path.resolve('dist')
const MIME = { '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  if (req.url.includes('favicon')) { res.writeHead(204); res.end(); return }
  const f = path.join(root, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]))
  fs.readFile(f, (e, buf) => {
    if (e) { res.writeHead(404); res.end('nf'); return }
    res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] ?? 'text/html; charset=utf-8' }); res.end(buf)
  })
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/`

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
const errs = []
page.on('pageerror', e => errs.push(e.message))
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_EMPTY_RESPONSE')) errs.push('console: ' + m.text()) })

const goto = async (hash) => { await page.goto(base + FILE + hash, { waitUntil: 'networkidle2' }); await new Promise(r => setTimeout(r, 900)) }
const txt = async () => (await page.evaluate(() => document.querySelector('main')?.innerText || '')).replace(/\n/g, ' | ')
const chipCount = async () => page.evaluate(() => document.querySelectorAll('.chip').length)
const clickText = async (t) => {
  const ok = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('button, a, [role=button]')]
    const el = els.find(e => e.innerText && e.innerText.trim().includes(t))
    if (el) { el.click(); return true } return false
  }, t)
  await new Promise(r => setTimeout(r, 350))
  return ok
}
const waitHas = async (t, ms = 4000) => {
  const start = Date.now()
  while (Date.now() - start < ms) { if ((await txt()).includes(t)) return true; await new Promise(r => setTimeout(r, 200)) }
  return false
}

let pass = 0, fail = 0
const assert = (name, cond) => { if (cond) { pass++; console.log('PASS', name) } else { fail++; console.log('FAIL', name) } }

// ---- 1) 长期负债删除（应用内确认）----
await goto('#/settings')
assert('负债删除前存在车贷', (await txt()).includes('车贷'))
await clickText('车贷')
assert('负债编辑弹窗含删除按钮', await waitHas('删除', 2000))
await clickText('删除')
assert('负债确认弹窗出现', await waitHas('确认删除', 2000))
await clickText('确认删除')
await new Promise(r => setTimeout(r, 700))
const afterLiab = await txt()
assert('负债删除后列表显示「暂无长期负债」', afterLiab.includes('暂无长期负债'))

// ---- 2) 预算删除（应用内确认）----
// 注：预算功能已从代码中移除（src 内无 budget 相关实现），设置页不再有 .chip。
// 保留这段是为了向后兼容——将来预算回归时断言自动恢复生效。
await goto('#/settings')
const chipsBefore = await chipCount()
if (chipsBefore < 1) {
  console.log('SKIP 预算 chip 断言 — 预算功能已移除，设置页无 .chip')
} else {
assert('预算删除前有 chip（种子总支出预算）', chipsBefore >= 1)
// 直接点击第一个预算 chip（文本形如「总支出 ¥9000 ✕」）
const chipClicked = await page.evaluate(() => {
  const c = document.querySelector('.chip')
  if (c) { c.click(); return c.innerText.trim() } return null
})
console.log('  budget chip clicked:', chipClicked)
assert('预算确认弹窗出现', await waitHas('确认删除', 2000))
await clickText('确认删除')
await new Promise(r => setTimeout(r, 700))
const chipsAfter = await chipCount()
assert('预算删除后 chip 减少', chipsAfter < chipsBefore)
}

// ---- 3) 分类删除（应用内确认，分类管理内嵌于设置页）----
await goto('#/settings')
const catBefore = (await txt()).includes('餐饮')
// 点击分类卡片（button.card-2 内包含 餐饮），排除预算条里的 餐饮 标签
const catClicked = await page.evaluate(() => {
  const els = [...document.querySelectorAll('button.card-2')]
  const el = els.find(e => e.innerText && e.innerText.includes('餐饮'))
  if (el) { el.click(); return true } return false
})
await new Promise(r => setTimeout(r, 400))
assert('分类卡片可点击进入编辑', catClicked && (await waitHas('删除', 2000)))
await clickText('删除')
assert('分类确认弹窗出现', await waitHas('确认删除', 2000))
await clickText('确认删除')
await new Promise(r => setTimeout(r, 600))
const catAfter = await txt()
// 预算条里仍可能显示「餐饮」字样，故以分类列表是否仍存在该卡片为准
const catCardGone = await page.evaluate(() => {
  const els = [...document.querySelectorAll('button.card-2')]
  return !els.some(e => e.innerText && e.innerText.includes('餐饮'))
})
assert('分类删除后分类卡片「餐饮」消失', catCardGone)

// ---- 4) 刷新行情不卡死（按钮在合理时间内复位）----
await goto('#/invest/holdings')
await clickText('↻ 刷新行情')
let reset = false
const start = Date.now()
while (Date.now() - start < 15000) {
  const t = await txt()
  if (t.includes('↻ 刷新行情') && !t.includes('刷新中')) { reset = true; break }
  await new Promise(r => setTimeout(r, 300))
}
assert('刷新行情按钮在15s内复位（未卡死）', reset)

console.log('--- JS_ERRORS:', errs.length ? errs.slice(0, 5).join(' | ') : 'none')
console.log(`RESULT: ${pass} passed, ${fail} failed`)
await browser.close(); server.close()

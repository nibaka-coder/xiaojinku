import puppeteer from 'puppeteer-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('dist')
const FILE = 'index.html'
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
    const txt = await page.evaluate(() => document.querySelector('main')?.innerText || '')
    if (txt.includes(substr)) { clearInterval(iv); resolve(txt) }
    else if (Date.now() - t0 > timeout) { clearInterval(iv); reject(new Error('timeout waiting: ' + substr)) }
  }, 200)
})
const goto = async (hash) => { await page.goto(base + FILE + hash, { waitUntil: 'networkidle2' }); await waitText('') }
let pass = 0, fail = 0
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); cond ? pass++ : fail++ }

// 概览：无预算字样、无预算进度条
await goto('#/')
let txt = await page.evaluate(() => document.body.innerText)
check('概览页无「预算」字样', !txt.includes('预算'))
check('概览页无「支出预算」字样', !txt.includes('支出预算'))

// 设置：无预算编辑入口
await goto('#/settings')
txt = await page.evaluate(() => document.body.innerText)
check('设置页无「预算」区块', !txt.includes('预算'))
check('设置页无「添加 / 编辑预算」按钮', !txt.includes('添加 / 编辑预算'))
check('设置页无「月度预算」字样', !txt.includes('月度预算'))

// 分类：无月预算字段
await goto('#/settings') // 分类管理在设置内，点开编辑
txt = await page.evaluate(() => document.body.innerText)
check('分类无「月预算」字样', !txt.includes('月预算'))

// 统计：无预算卡片
await goto('#/statistics')
txt = await page.evaluate(() => document.body.innerText)
check('统计页无「预算执行」字样', !txt.includes('预算执行'))

// 记账/流水/持仓 正常渲染（无崩溃）
await goto('#/add'); check('记账页渲染', (await page.evaluate(() => document.body.innerText)).includes('记账'))
await goto('#/invest/holdings'); check('持仓页渲染', (await page.evaluate(() => document.body.innerText)).includes('持仓总览'))

check('无 JS 报错', errs.length === 0)
if (errs.length) console.log('ERRORS:', errs.join(' | '))
console.log(`\n结果: ${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail ? 1 : 0)

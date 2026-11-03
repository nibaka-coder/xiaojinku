import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(__dirname, '../../app')
const require = createRequire(pathToFileURL(path.join(appDir, 'package.json')).href)
const puppeteer = require('puppeteer-core')
const html = 'file:///' + path.join(__dirname, 'preview.html').replace(/\\/g, '/')
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files', '--font-render-hinting=none'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 1400, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
await page.goto(html, { waitUntil: 'networkidle0' })
await page.evaluate(() => document.fonts.ready)
await new Promise((r) => setTimeout(r, 400))

const iconOk = await page.evaluate(() => {
  const uses = document.querySelectorAll('svg use')
  const missing = [...uses].filter((u) => !document.querySelector(u.getAttribute('href'))).length
  return { count: uses.length, missing }
})
console.log('icon use:', JSON.stringify(iconOk))

const shots = [
  ['#shot1', '01-记账页-现状vs改善后.png'],
  ['#shot2', '02-分层控件-三层视觉分级.png'],
  ['#shot3', '03-方案A与B-效果对比.png'],
]
for (const [sel, name] of shots) {
  const h = await page.$(sel)
  if (!h) { console.log('MISSING', sel); continue }
  const out = path.join(__dirname, name)
  await h.screenshot({ path: out, captureBeyondViewport: true })
  console.log('saved', name)
}
await browser.close()

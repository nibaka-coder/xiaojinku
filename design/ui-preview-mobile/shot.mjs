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
await page.setViewport({ width: 1400, height: 1200, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
await page.goto(html, { waitUntil: 'networkidle0' })
await page.evaluate(() => document.fonts.ready)
await new Promise((r) => setTimeout(r, 400))

const iconOk = await page.evaluate(() => {
  const uses = document.querySelectorAll('svg use')
  return { count: uses.length, first: uses[0]?.getAttribute('href') || '' }
})
console.log('icon use:', JSON.stringify(iconOk))

const shots = [
  ['#shot1', '01-记账页-溢出与顶栏.png'],
  ['#shot2', '02-底栏选中态-浅色暗色对比度.png'],
  ['#shot3', '03-导航结构与热区-需拍板.png'],
]
for (const [sel, name] of shots) {
  const h = await page.$(sel)
  if (!h) { console.log('MISSING', sel); continue }
  const out = path.join(__dirname, name)
  await h.screenshot({ path: out, captureBeyondViewport: true })
  console.log('saved', name)
}
await browser.close()

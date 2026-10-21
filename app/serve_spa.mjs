import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const ROOT = 'C:/Users/11470/WorkBuddy/2026-10-12-10-17-13/app/dist'
const PORT = 8099
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
}

const server = http.createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0])
    let filePath = join(ROOT, normalize(urlPath))
    let s
    try { s = await stat(filePath) } catch { s = null }
    if (s && s.isDirectory()) filePath = join(filePath, 'index.html')
    try { s = await stat(filePath) } catch { s = null }
    if (!s) {
      // SPA fallback
      const html = await readFile(join(ROOT, 'index.html'))
      res.writeHead(200, { 'Content-Type': 'text/html' })
      return res.end(html)
    }
    const data = await readFile(filePath)
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' })
    res.end(data)
  } catch (e) {
    res.writeHead(500); res.end(String(e))
  }
})
server.listen(PORT, '127.0.0.1', () => console.log('SPA server on http://127.0.0.1:' + PORT))

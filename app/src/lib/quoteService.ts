import type { Market } from '@/types'

// 带超时的 fetch 文本：受限沙箱里到某些主机的网络请求会挂起不返回，
// 必须限时失败并降级到下一通道，否则「刷新行情」会卡住无反应。
async function fetchText(url: string, ms = 4000): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// 行情服务：统一收敛所有外部行情请求
// 通道 1：东方财富 push2 fetch（覆盖 A股/美股/港股/ETF，带名称与涨跌幅）
// 通道 2：腾讯 gtimg script 注入（不依赖 CORS/回调——gtimg 不支持 cb 参数，
//         但会把行情挂到全局变量 v_sh601919 / v_hk00700 / v_usAAPL 上，
//         script onload 后轮询读全局变量即可；这是最稳的兜底通道）
// 通道 3：东方财富 push2 JSONP（cb 参数，东财可用时的补充）
// 降级：取不到时返回 null，由上层回退 manualPrice

// 由市场 + 代码拼接东财 secid
export function secidFor(market: Market, code: string): string {
  const c = code.trim().toUpperCase()
  if (market === 'us') return `105.${c}`
  if (market === 'hk') return `116.${c}`
  const first = c[0]
  if (first === '6' || first === '9') return `1.${c}`
  return `0.${c}`
}

function eastUrl(secid: string): string {
  const fields = 'f43,f44,f45,f46,f57,f58,f60,f152,f170,f171'
  return `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=${fields}&cb=_eastcb_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`
}

// 解析东财返回（兼容 JSON 与 JSONP 两种包裹形式）
// 注意：f43（现价）与 f170（涨跌幅）均为放大后的整数，真实值 = 原值 / 10^f152（f152 为小数位数，通常为 2）
function parseEast(raw: string): { price: number; name?: string; changePct?: number } | null {
  let t = raw.trim()
  if (!t) return null
  // 剥掉 JSONP 包裹：xxx({...}) 或 callbackName({...})
  const i = t.indexOf('(')
  const j = t.lastIndexOf(')')
  if (i !== -1 && j > i) t = t.slice(i + 1, j)
  try {
    const obj = JSON.parse(t)
    const d = obj?.data
    if (!d) return null
    const raw_price = parseFloat(d.f43)
    if (!isFinite(raw_price) || raw_price <= 0) return null
    const digits = isFinite(parseFloat(d.f152)) ? parseFloat(d.f152) : 2
    const scale = Math.pow(10, digits)
    const price = raw_price / scale
    if (!isFinite(price) || price <= 0) return null
    const changePct = parseFloat(d.f170)
    return {
      price,
      name: d.f58,
      changePct: isFinite(changePct) ? changePct / scale : undefined,
    }
  } catch {
    return null
  }
}

// ===== 腾讯 gtimg（主力兜底：A股/港股/美股全覆盖）=====
// gtimg 不支持 cb 回调参数（加了也会忽略，返回裸 JS），
// 返回内容形如 v_sh601919="1~中远海控~601919~16.73~..."，会挂成全局变量。
// 因此用 script onload + 轮询全局变量的方式取数。
function tencentCode(market: Market, secid: string): string | null {
  const [p, c] = secid.split('.')
  if (market === 'hk') return `hk${c}`
  if (market === 'us') return `us${c.toUpperCase()}`
  if (p === '1') return 'sh' + c
  if (p === '0') return 'sz' + c
  return null
}

function fetchTencent(
  market: Market,
  secid: string
): Promise<{ price: number; name?: string; changePct?: number } | null> {
  const code = tencentCode(market, secid)
  if (!code) return Promise.resolve(null)
  return new Promise((resolve) => {
    const varName = 'v_' + code
    const s = document.createElement('script')
    s.charset = 'GBK'
    const timeout = setTimeout(() => {
      cleanup()
      resolve(null)
    }, 6000)
    let polls = 0
    function cleanup() {
      clearTimeout(timeout)
      s.remove()
    }
    function read(): { price: number; name?: string; changePct?: number } | null {
      const raw = (window as any)[varName]
      if (typeof raw !== 'string' || !raw) return null
      const f = raw.split('~')
      const price = parseFloat(f[3])
      if (!isFinite(price) || price <= 0) return null
      // 字段下标（JS 0-based）：1=名称、3=现价、30=涨跌额、31=涨跌幅（A股/港股/美股一致）
      const name = typeof f[1] === 'string' && f[1].trim() ? f[1].trim() : undefined
      const cp = parseFloat(f[31])
      return { price, name, changePct: isFinite(cp) && Math.abs(cp) < 25 ? cp : undefined }
    }
    function poll() {
      const r = read()
      if (r) {
        cleanup()
        resolve(r)
        return
      }
      if (++polls > 12) {
        cleanup()
        resolve(null)
        return
      }
      setTimeout(poll, 250)
    }
    s.onerror = () => {
      cleanup()
      resolve(null)
    }
    s.onload = poll
    s.src = `https://qt.gtimg.cn/q=${code}`
    document.head.appendChild(s)
  })
}

// 东财 JSONP（东财恢复可用时的补充通道）
function jsonpEast(secid: string): Promise<{ price: number; name?: string } | null> {
  return new Promise((resolve) => {
    const name = '_eastcb_' + Math.random().toString(36).slice(2)
    const s = document.createElement('script')
    const timeout = setTimeout(() => {
      cleanup()
      resolve(null)
    }, 5000)
    function cleanup() {
      clearTimeout(timeout)
      s.remove()
      delete (window as any)[name]
    }
    ;(window as any)[name] = (data: any) => {
      cleanup()
      resolve(parseEast(typeof data === 'string' ? data : JSON.stringify(data)))
    }
    s.onerror = () => {
      cleanup()
      resolve(null)
    }
    s.src = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f57,f58,f60,f152,f170&cb=${name}`
    document.body.appendChild(s)
  })
}

export interface QuoteResult {
  price: number
  name?: string
  changePct?: number
}

// 东财 fetch 通道（限时 3.5s）
async function fetchEast(secid: string): Promise<QuoteResult | null> {
  try {
    const txt = await fetchText(eastUrl(secid), 3500)
    return txt ? parseEast(txt) : null
  } catch {
    return null
  }
}

// 取单只证券现价：
// 东财 fetch 与腾讯 gtimg 并发竞速，谁先成功用谁（任一数据源故障不影响取价）；
// 两者都失败再降级到东财 JSONP。全部失败返回 null，上层保留上一次价格。
export async function fetchPrice(secid: string, market: Market): Promise<QuoteResult | null> {
  // 取值为空的分支视作失败，交给 Promise.any 继续等其他通道
  const east = fetchEast(secid).then((r) => {
    if (!r) throw new Error('east empty')
    return r
  })
  const tencent = fetchTencent(market, secid).then((r) => {
    if (!r) throw new Error('tencent empty')
    return r
  })
  try {
    return await Promise.any([east, tencent])
  } catch {
    /* 两个通道都失败 → 走 JSONP 兜底 */
  }
  const j = await jsonpEast(secid)
  return j ?? null
}

// ===== 汇率（USD→CNY / HKD→CNY）=====
// 主源：open.er-api.com（exchangerate-api v6，CORS *，file:// 与普通页面均可 fetch）
// 备源：api.exchangerate-api.com v4；最后东财外汇 JSONP（东财不可用时自然超时跳过）

export interface FxRates {
  usdRate: number // 1 USD = ? CNY
  hkdRate: number // 1 HKD = ? CNY
}

function parseFxJson(txt: string): FxRates | null {
  try {
    const json = JSON.parse(txt)
    const cny = json?.rates?.CNY
    const hkd = json?.rates?.HKD
    if (cny > 0 && hkd > 0) return { usdRate: cny, hkdRate: hkd }
  } catch {
    /* 忽略 */
  }
  return null
}

// 东财外汇 JSONP（市场 133：USDCNH/HKDCNH）——东财不可用时超时跳过
function jsonpEastFx(): Promise<FxRates | null> {
  return new Promise((resolve) => {
    const name = '_eastfx_' + Math.random().toString(36).slice(2)
    const s = document.createElement('script')
    const timeout = setTimeout(() => {
      cleanup()
      resolve(null)
    }, 5000)
    function cleanup() {
      clearTimeout(timeout)
      s.remove()
      delete (window as any)[name]
    }
    ;(window as any)[name] = (data: any) => {
      cleanup()
      try {
        const diff = data?.data?.diff
        if (!diff) return resolve(null)
        let usdRate = 0
        let hkdRate = 0
        for (const v of Object.values(diff) as any[]) {
          const code = v.f12
          const raw = parseFloat(v.f43)
          if (!isFinite(raw)) continue
          const digits = isFinite(parseFloat(v.f152)) ? parseFloat(v.f152) : 0
          const price = digits ? raw / Math.pow(10, digits) : raw
          if (code === 'USDCNH') usdRate = price
          if (code === 'HKDCNH') hkdRate = price
        }
        if (usdRate > 0 && hkdRate > 0) resolve({ usdRate, hkdRate })
        else resolve(null)
      } catch {
        resolve(null)
      }
    }
    s.onerror = () => {
      cleanup()
      resolve(null)
    }
    s.src = `https://push2.eastmoney.com/api/qt/clist/get?fs=m:133+t:0&fields=f12,f43,f152&cb=${name}`
    document.body.appendChild(s)
  })
}

// 获取 USD/HKD → CNY 汇率；失败返回 null（由上层保留原值/手动输入）
export async function fetchFxRates(): Promise<FxRates | null> {
  // 1. exchangerate-api v6（CORS *）
  try {
    const txt = await fetchText('https://open.er-api.com/v6/latest/USD', 4000)
    if (txt) {
      const r = parseFxJson(txt)
      if (r) return r
    }
  } catch {
    /* 走降级 */
  }
  // 2. exchangerate-api v4
  try {
    const txt = await fetchText('https://api.exchangerate-api.com/v4/latest/USD', 4000)
    if (txt) {
      const r = parseFxJson(txt)
      if (r) return r
    }
  } catch {
    /* 走降级 */
  }
  // 3. 东财外汇 JSONP
  return jsonpEastFx()
}

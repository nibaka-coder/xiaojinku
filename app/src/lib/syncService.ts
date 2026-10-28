import type { ExportData } from '@/types'
import { toTransferPayload } from '@/lib/ledger'

// 云同步客户端（自建服务器）
// 契约与 deploy/api.php 一致：整份数据 JSON + 版本号，冲突时服务端返回 409。
// 设计原则：本地优先（离线可用），同步失败不影响记账；冲突绝不静默覆盖。

export interface RemoteState {
  version: number
  updatedAt?: string | null
  data: ExportData | null
}

export type PullResult =
  | { kind: 'empty' }
  | { kind: 'up-to-date'; version: number }
  | { kind: 'remote-newer'; state: RemoteState }
  | { kind: 'error'; message: string }

export type PushResult =
  | { kind: 'ok'; version: number; updatedAt?: string }
  | { kind: 'conflict'; state: RemoteState }
  | { kind: 'error'; message: string }

export interface SyncConfigInput {
  url: string
  token: string
  version: number
}

function endpoint(url: string): string {
  return url.trim()
}

async function request(
  url: string,
  token: string,
  init: RequestInit,
  ms = 8000
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Token': token,
        ...(init.headers || {}),
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

// 拉取服务器数据
export async function pull(cfg: SyncConfigInput): Promise<PullResult> {
  const url = endpoint(cfg.url)
  if (!url) return { kind: 'error', message: '未配置同步地址' }
  try {
    const res = await request(url, cfg.token, { method: 'GET' }, 8000)
    if (!res.ok) {
      return { kind: 'error', message: res.status === 401 ? '令牌不正确' : `服务器返回 ${res.status}` }
    }
    const j = await res.json()
    const version = Number(j?.version ?? 0)
    if (!j?.data) return { kind: 'empty' }
    // 服务器版本不比本地已同步版本新 → 本地更新或持平，不覆盖本地
    if (version <= cfg.version) return { kind: 'up-to-date', version }
    return { kind: 'remote-newer', state: { version, updatedAt: j.updatedAt ?? null, data: j.data } }
  } catch (e: any) {
    if (e?.name === 'AbortError') return { kind: 'error', message: '连接超时' }
    return { kind: 'error', message: '无法连接服务器' }
  }
}

// 推送本地数据；force=true 时强制覆盖服务器版本
export async function push(
  cfg: SyncConfigInput,
  data: ExportData,
  force = false
): Promise<PushResult> {
  const url = endpoint(cfg.url)
  if (!url) return { kind: 'error', message: '未配置同步地址' }
  try {
    // 发送前最后一道闸：清洗并断言载荷不含设备本地配置（token / pinHash / 锁 / 主题）。
    // 命中异常直接抛错中止上传 —— 宁可同步失败，也不能把凭据送出去。
    const payload = toTransferPayload(data)
    const res = await request(
      url,
      cfg.token,
      {
        method: 'POST',
        body: JSON.stringify({ baseVersion: cfg.version, data: payload, force }),
      },
      10000
    )
    if (res.status === 409) {
      const j = await res.json().catch(() => null)
      return {
        kind: 'conflict',
        state: {
          version: Number(j?.version ?? 0),
          updatedAt: j?.updatedAt ?? null,
          data: j?.data ?? null,
        },
      }
    }
    if (!res.ok) {
      return { kind: 'error', message: res.status === 401 ? '令牌不正确' : `服务器返回 ${res.status}` }
    }
    const j = await res.json()
    return { kind: 'ok', version: Number(j?.version ?? cfg.version + 1), updatedAt: j?.updatedAt }
  } catch (e: any) {
    if (e?.name === 'AbortError') return { kind: 'error', message: '连接超时' }
    return { kind: 'error', message: '无法连接服务器' }
  }
}

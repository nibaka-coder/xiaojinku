import type { DeviceSettings, ExportData, LedgerSettings, Settings } from '@/types'

/**
 * 账本 / 设备配置分离。
 *
 * 背景：备份文件（导出 JSON）与同步快照（上传至服务器）此前直接携带完整 settings，
 * 导致同步令牌与锁屏 PIN 哈希以明文落盘在服务器数据文件与 30 份历史快照中。
 *
 * 约定：
 * - 「账本级」字段可导出、可同步（defaultCurrency / fxRate / cashOpening / ... ）
 * - 「设备级」字段永不出域（sync.token / pinHash / appLockEnabled / theme / lastBackupAt / dividendScanAt）
 *
 * 采用**白名单**剥离而非黑名单：以后新增任何设置字段，默认不会外流，
 * 必须显式加入 ledgerSettingsOf 才会进入备份与同步载荷。
 */

/** 白名单：账本级设置字段 */
const LEDGER_KEYS = [
  'defaultCurrency',
  'fxRate',
  'hkdRate',
  'currencySymbolUSD',
  'currencySymbolCNY',
  'cashOpening',
  'costBasis',
  'dividendIgnored',
  'isSeed',
] as const

/** 设备级字段：一旦出现在导出/同步载荷中即为异常 */
export const DEVICE_SETTING_KEYS = [
  'appLockEnabled',
  'pinHash',
  'theme',
  'sync',
  'lastBackupAt',
  'dividendScanAt',
] as const

/** 从完整 Settings 中挑出账本级字段（导出/同步前的剥离入口） */
export function ledgerSettingsOf(s: Settings): LedgerSettings {
  const out: Record<string, unknown> = {}
  const src = s as unknown as Record<string, unknown>
  for (const k of LEDGER_KEYS) {
    const v = src[k]
    if (v !== undefined) out[k] = v
  }
  return out as unknown as LedgerSettings
}

/** 取出本机设备级配置（导入/拉取时用于覆盖外来值） */
export function deviceSettingsOf(s: Settings): DeviceSettings {
  return {
    appLockEnabled: s.appLockEnabled,
    pinHash: s.pinHash,
    theme: s.theme,
    sync: s.sync,
    lastBackupAt: s.lastBackupAt,
    dividendScanAt: s.dividendScanAt,
  }
}

/** 兜底清洗：把混入的设备级字段从载荷中剔除（返回副本，不修改入参） */
export function sanitizeForTransfer<T extends { settings?: unknown }>(payload: T): T {
  if (!payload || typeof payload !== 'object' || !('settings' in payload)) return payload
  const s = payload.settings
  if (!s || typeof s !== 'object') return payload
  const cleaned: Record<string, unknown> = { ...(s as Record<string, unknown>) }
  for (const k of DEVICE_SETTING_KEYS) delete cleaned[k]
  return { ...payload, settings: cleaned } as T
}

/**
 * 断言载荷不含设备级配置。用于发送前的最后一道闸，
 * 命中即抛错（宁可同步失败，也不能把凭据送出去）。
 */
export function assertNoSecrets(payload: unknown, label = 'payload'): void {
  if (!payload || typeof payload !== 'object') return
  const s = (payload as { settings?: unknown }).settings
  if (!s || typeof s !== 'object') return
  const leaked = DEVICE_SETTING_KEYS.filter((k) => k in (s as Record<string, unknown>))
  if (leaked.length > 0) {
    throw new Error(`[xiaojinku] ${label} 含设备本地配置（${leaked.join(', ')}），已阻止传输`)
  }
}

/** 导出/发送的统一出口：剥离 + 断言 */
export function toTransferPayload(d: ExportData): ExportData {
  const cleaned = sanitizeForTransfer(d)
  assertNoSecrets(cleaned, 'sync payload')
  return cleaned
}

import { create } from 'zustand'
import { useStore } from '@/store/useStore'
import { pull, push, type RemoteState } from '@/lib/syncService'
import type { ExportData } from '@/types'

// 云同步引擎：本地优先 + 自动推拉 + 冲突绝不静默覆盖
//
// 安全规则（重要）：
// 1. 未完成首次拉取前不允许自动推送，避免空账本把服务器上的数据覆盖掉；
// 2. 服务器版本更新且本地有数据时，弹窗让用户二选一，绝不自动覆盖任何一边；
// 3. 新设备（本地为空）拉取到服务器数据时，直接导入，不视为冲突。

export interface ConflictPayload {
  state: RemoteState
}

interface SyncStoreState {
  status: 'idle' | 'syncing'
  lastError: string
  conflict: ConflictPayload | null
  armed: boolean // 是否已与服务器对齐（未对齐前禁止自动推送）
  syncNow: () => Promise<void>
  uploadNow: () => Promise<void>
  downloadNow: () => Promise<void>
  scheduleSync: () => void
  resolveWithRemote: () => void
  resolveWithLocal: () => Promise<void>
  dismissConflict: () => void
  clearError: () => void
}

let timer: ReturnType<typeof setTimeout> | null = null
let subscribing = false
// 刚从服务器取回数据后短暂抑制自动推送，避免把相同数据原样回传
let remoteAppliedAt = 0

// 本机是否尚未形成真实账本：全新空账本，或仍是未动过的示例数据。
// 这类情况拉取到服务器数据时直接采用，不弹冲突框（换手机/首次接入的正常场景）。
function isLocalUntouched(): boolean {
  const s = useStore.getState()
  if (s.settings.isSeed === true) return true
  return (
    s.transactions.length === 0 &&
    s.liabilities.length === 0 &&
    s.categories.length === 0 &&
    s.securities.length === 0 &&
    s.investTxns.length === 0
  )
}

function cfg() {
  const s = useStore.getState()
  return s.settings.sync
}

function exportSnapshot(): ExportData {
  return useStore.getState().exportData()
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  status: 'idle',
  lastError: '',
  conflict: null,
  armed: false,

  // 改动后 2 秒防抖推送
  scheduleSync: () => {
    if (!cfg().enabled) return
    if (!get().armed) return
    if (Date.now() - remoteAppliedAt < 3000) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      get().uploadNow()
    }, 2000)
  },

  // 拉取并按需处理（打开应用时用）
  syncNow: async () => {
    const c = cfg()
    if (!c.enabled || !c.url) return
    set({ status: 'syncing', lastError: '' })
    const res = await pull({ url: c.url, token: c.token, version: c.version })
    if (res.kind === 'error') {
      set({ status: 'idle', lastError: res.message, armed: true })
      return
    }
    if (res.kind === 'remote-newer') {
      // 新设备（本地为空）直接采用服务器数据；否则交给用户裁决
      if (isLocalUntouched()) {
        remoteAppliedAt = Date.now()
        useStore.getState().applyRemote(res.state.data!, res.state.version)
        set({ status: 'idle', armed: true, lastError: '' })
        return
      }
      set({ status: 'idle', conflict: { state: res.state }, armed: true })
      return
    }
    set({ status: 'idle', armed: true, lastError: '' })
  },

  // 上传本地数据
  uploadNow: async () => {
    const c = cfg()
    if (!c.enabled || !c.url) return
    if (isLocalUntouched() && !get().armed) {
      set({ lastError: '本机暂无数据，请先从服务器下载' })
      return
    }
    set({ status: 'syncing', lastError: '' })
    const res = await push({ url: c.url, token: c.token, version: c.version }, exportSnapshot())
    if (res.kind === 'ok') {
      useStore.getState().markSynced(res.version)
      set({ status: 'idle', armed: true, lastError: '' })
      return
    }
    if (res.kind === 'conflict') {
      set({ status: 'idle', conflict: { state: res.state } })
      return
    }
    set({ status: 'idle', lastError: res.message })
  },

  // 强制以服务器为准下载（用户手动点「立即下载」时不经冲突判断）
  downloadNow: async () => {
    const c = cfg()
    if (!c.enabled || !c.url) return
    set({ status: 'syncing', lastError: '' })
    const res = await pull({ url: c.url, token: c.token, version: -1 })
    if (res.kind === 'error') {
      set({ status: 'idle', lastError: res.message })
      return
    }
    if (res.kind === 'remote-newer' && res.state.data) {
      remoteAppliedAt = Date.now()
      useStore.getState().applyRemote(res.state.data, res.state.version)
      set({ status: 'idle', armed: true, lastError: '' })
      return
    }
    set({ status: 'idle', armed: true, lastError: '' })
  },

  // 冲突：采用服务器数据
  resolveWithRemote: () => {
    const c = get().conflict
    if (!c?.state.data) {
      set({ conflict: null })
      return
    }
    remoteAppliedAt = Date.now()
    useStore.getState().applyRemote(c.state.data, c.state.version)
    set({ conflict: null, armed: true, lastError: '' })
  },

  // 冲突：保留本机数据并强制覆盖服务器
  resolveWithLocal: async () => {
    const c = get().conflict
    if (!c) return
    const conf = cfg()
    set({ conflict: null, status: 'syncing', lastError: '' })
    const res = await push(
      { url: conf.url, token: conf.token, version: c.state.version },
      exportSnapshot(),
      true
    )
    if (res.kind === 'ok') {
      useStore.getState().markSynced(res.version)
      set({ status: 'idle', armed: true, lastError: '' })
      return
    }
    set({ status: 'idle', lastError: res.kind === 'error' ? res.message : '覆盖失败' })
  },

  dismissConflict: () => set({ conflict: null }),
  clearError: () => set({ lastError: '' }),
}))

// 数据变化时自动安排推送（仅在启用同步且已与服务器对齐后）
export function startSyncWatcher() {
  if (subscribing) return
  subscribing = true
  useStore.subscribe((state, prev) => {
    const c = state.settings.sync
    if (!c.enabled || !c.url) return
    const changed =
      state.transactions !== prev.transactions ||
      state.liabilities !== prev.liabilities ||
      state.categories !== prev.categories ||
      state.securities !== prev.securities ||
      state.investTxns !== prev.investTxns ||
      state.settings.cashOpening !== prev.settings.cashOpening
    if (changed) useSyncStore.getState().scheduleSync()
  })
}

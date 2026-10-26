import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { useSyncStore } from '@/store/useSyncStore'
import { pull } from '@/lib/syncService'
import SubPage from './SubPage'

export default function Sync() {
  const sync = useStore((s) => s.settings.sync)
  const setSyncConfig = useStore((s) => s.setSyncConfig)
  const syncStatus = useSyncStore((s) => s.status)
  const syncError = useSyncStore((s) => s.lastError)
  const uploadNow = useSyncStore((s) => s.uploadNow)
  const downloadNow = useSyncStore((s) => s.downloadNow)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState('')

  const test = async () => {
    setTesting(true)
    setTestMsg('')
    const r = await pull({ url: sync.url, token: sync.token, version: -1 })
    if (r.kind === 'error') setTestMsg('连接失败：' + r.message)
    else
      setTestMsg(
        '连接成功' + (r.kind === 'empty' ? '（服务器暂无数据）' : '（服务器已有数据）')
      )
    setTesting(false)
  }

  return (
    <SubPage title="云同步">
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-main">自建服务器</h2>
          <button
            onClick={() => setSyncConfig({ enabled: !sync.enabled })}
            className="text-xs px-2 py-1 rounded-full"
            style={{
              background: sync.enabled ? 'var(--accent-soft)' : 'var(--card-2)',
              color: sync.enabled ? 'var(--accent-strong)' : 'var(--faint)',
            }}
          >
            {sync.enabled ? '已启用' : '已关闭'}
          </button>
        </div>

        <div>
          <label className="label">接口地址</label>
          <input
            className="input"
            placeholder="https://money.example.com/sync/api.php"
            value={sync.url}
            onChange={(e) => setSyncConfig({ url: e.target.value })}
          />
        </div>
        <div>
          <label className="label">访问令牌</label>
          <input
            className="input"
            type="password"
            placeholder="服务器上 token.txt 里的令牌"
            value={sync.token}
            onChange={(e) => setSyncConfig({ token: e.target.value })}
          />
        </div>

        <div className="flex gap-2">
          <button className="btn-outline flex-1" onClick={test} disabled={testing || !sync.url}>
            {testing ? '测试中…' : '测试连接'}
          </button>
          <button
            className="btn-outline flex-1"
            onClick={() => downloadNow()}
            disabled={!sync.url || syncStatus === 'syncing'}
          >
            立即下载
          </button>
          <button
            className="btn-outline flex-1"
            onClick={() => uploadNow()}
            disabled={!sync.url || syncStatus === 'syncing'}
          >
            立即上传
          </button>
        </div>

        {testMsg && (
          <p
            className="text-xs"
            style={{ color: testMsg.startsWith('连接成功') ? 'var(--income)' : 'var(--danger)' }}
          >
            {testMsg}
          </p>
        )}
        {syncError && (
          <p className="text-xs" style={{ color: 'var(--danger)' }}>
            同步失败：{syncError}
          </p>
        )}
        <p className="text-xs text-faint">
          {sync.lastSyncAt
            ? `最近同步：${sync.lastSyncAt.slice(0, 10)} ${sync.lastSyncAt.slice(11, 16)} · 服务器版本 ${sync.version}`
            : '尚未同步过。启用后改动会自动上传，打开应用时会自动下载。'}
        </p>
      </section>

      <section className="card space-y-2">
        <p className="text-xs text-faint">
          数据以整份 JSON 存在你自己的服务器；两端同时改动时会弹窗让你选择保留哪一份，不会静默覆盖。
        </p>
      </section>
    </SubPage>
  )
}

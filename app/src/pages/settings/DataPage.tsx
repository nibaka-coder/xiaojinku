import { useState } from 'react'
import { useStore } from '@/store/useStore'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import SubPage from './SubPage'

export default function DataPage() {
  const exportData = useStore((s) => s.exportData)
  const importData = useStore((s) => s.importData)
  const resetToSeed = useStore((s) => s.resetToSeed)
  const clearAllData = useStore((s) => s.clearAllData)
  const lastBackupAt = useStore((s) => s.settings.lastBackupAt)

  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [exportText, setExportText] = useState('')
  const [toast, setToast] = useState('')
  const showToast = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 2200)
  }
  const copyText = (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(
          () => showToast('已复制到剪贴板'),
          () => fallbackCopy(text)
        )
      } else fallbackCopy(text)
    } catch {
      fallbackCopy(text)
    }
  }
  const fallbackCopy = (text: string) => {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
      showToast('已复制到剪贴板')
    } catch {
      showToast('复制失败，请手动选择文本复制')
    }
  }
  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const d = JSON.parse(String(reader.result))
        if (d.app === 'xiaojinku') {
          importData(d)
          showToast('导入成功')
        } else showToast('文件格式不正确')
      } catch {
        showToast('解析失败，请检查文件')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }
  const handleExport = () => {
    const data = exportData()
    const json = JSON.stringify(data, null, 2)
    try {
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `xiaojinku-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      /* 受限环境下载被拦截，改用弹窗复制 */
    }
    useStore.getState().markBackup()
    setExportText(json)
  }
  const backupText = lastBackupAt
    ? `${lastBackupAt.slice(0, 10)}（${Math.floor(
        (Date.now() - new Date(lastBackupAt).getTime()) / 86400000
      )} 天前）`
    : '从未备份'

  return (
    <SubPage title="数据备份与导入">
      <section className="card space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-outline" onClick={handleExport}>
            导出 JSON
          </button>
          <label className="btn-outline text-center cursor-pointer">
            导入 JSON
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={onImportFile}
            />
          </label>
        </div>
        <p className="text-xs text-faint">上次备份：{backupText}</p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium text-main">危险操作</h2>
        <button
          className="btn-outline w-full text-red-500"
          onClick={() => setConfirmClear(true)}
        >
          清空全部数据（留空账本）
        </button>
        <button className="btn-outline w-full" onClick={() => setConfirmReset(true)}>
          清空并恢复示例数据
        </button>
        <p className="text-xs text-faint">
          数据保存在本浏览器（IndexedDB），不上传任何服务器。
        </p>
      </section>

      {exportText && (
        <Modal title="导出数据（JSON）" onClose={() => setExportText('')}>
          <p className="text-xs text-faint mb-2">
            若上方未自动下载，可点击下方「复制」并在本机保存为 <code>.json</code> 文件。
          </p>
          <textarea
            readOnly
            value={exportText}
            className="input h-56 w-full font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex gap-2 mt-3">
            <button className="btn-primary flex-1" onClick={() => copyText(exportText)}>
              复制全部
            </button>
            <button className="btn-ghost flex-1" onClick={() => setExportText('')}>
              关闭
            </button>
          </div>
        </Modal>
      )}

      {toast && (
        <div className="fixed left-1/2 top-20 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-sage-600 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}

      <ConfirmDialog
        open={confirmReset}
        title="清空并恢复示例数据"
        danger
        message="将清空全部数据并恢复为示例数据，此操作不可撤销。确定继续吗？"
        confirmText="确认清空"
        onConfirm={resetToSeed}
        onCancel={() => setConfirmReset(false)}
      />
      <ConfirmDialog
        open={confirmClear}
        title="清空全部数据"
        danger
        message="将删除全部流水、负债与投资记录，保留分类设置，得到一个可以直接开始记账的空账本。此操作不可撤销，建议先导出备份。"
        confirmText="确认清空"
        onConfirm={clearAllData}
        onCancel={() => setConfirmClear(false)}
      />
    </SubPage>
  )
}

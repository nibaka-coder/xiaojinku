import { useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { useSyncStore } from '@/store/useSyncStore'
import { fetchFxRates } from '@/lib/quoteService'
import { pull } from '@/lib/syncService'
import {
  cashBalance,
  creditLiability,
  investCashBalance,
  investSummary,
  liabilitiesTotal,
  liabilityCurrentBalance,
  netWorth,
} from '@/lib/calc'
import { fmtMoney } from '@/lib/money'
import { nowLocalISO } from '@/lib/date'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import Categories from '@/pages/Categories'
import type { Liability, Transaction, ThemeMode, CostBasis } from '@/types'

const LIAB_ICONS = ['🚗', '🏠', '🎓', '💊', '💼', '📦']

export default function Settings() {
  const settings = useStore((s) => s.settings)
  const transactions = useStore((s) => s.transactions)
  const liabilities = useStore((s) => s.liabilities)

  const setPin = useStore((s) => s.setPin)
  const disableLock = useStore((s) => s.disableLock)
  const setFxRate = useStore((s) => s.setFxRate)
  const setHkdRate = useStore((s) => s.setHkdRate)
  const exportData = useStore((s) => s.exportData)
  const importData = useStore((s) => s.importData)
  const resetToSeed = useStore((s) => s.resetToSeed)
  const clearAllData = useStore((s) => s.clearAllData)
  const setTheme = useStore((s) => s.setTheme)
  const setCostBasis = useStore((s) => s.setCostBasis)
  const costBasis = useStore((s) => s.settings.costBasis ?? 'actual')
  const setCashOpening = useStore((s) => s.setCashOpening)
  const setInvestCashOpening = useStore((s) => s.setInvestCashOpening)
  const securities = useStore((s) => s.securities)
  const investTxns = useStore((s) => s.investTxns)
  const addLiability = useStore((s) => s.addLiability)
  const updateLiability = useStore((s) => s.updateLiability)
  const deleteLiability = useStore((s) => s.deleteLiability)

  const cashOpening = settings.cashOpening
  const investCashOpening = settings.investCashOpening ?? 0
  const fxRate = settings.fxRate.rate
  const hkdRate = settings.hkdRate.rate
  const cash = useMemo(() => cashBalance(transactions, cashOpening), [transactions, cashOpening])
  const investCash = useMemo(
    () => investCashBalance(transactions, investTxns, fxRate, hkdRate, Infinity, investCashOpening),
    [transactions, investTxns, fxRate, hkdRate, investCashOpening]
  )
  const investMarket = useMemo(
    () => investSummary(securities, investTxns, fxRate, hkdRate).marketCNY,
    [securities, investTxns, fxRate, hkdRate]
  )
  const credit = useMemo(() => creditLiability(transactions), [transactions])
  const liabTotal = useMemo(() => liabilitiesTotal(liabilities, transactions), [liabilities, transactions])
  const nw = useMemo(
    () =>
      netWorth(
        transactions,
        liabilities,
        cashOpening,
        securities,
        investTxns,
        fxRate,
        hkdRate,
        investCashOpening
      ),
    [transactions, liabilities, cashOpening, securities, investTxns, fxRate, hkdRate, investCashOpening]
  )

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-main">设置</h1>

      {/* 资产负债总览 */}
      <section className="card space-y-3">
        <h2 className="font-medium text-main">资产负债</h2>
        <Row label="现金余额" value={fmtMoney(cash, 'CNY')} />
        <Row label="券商现金" value={fmtMoney(investCash, 'CNY')} />
        <Row label="投资市值" value={fmtMoney(investMarket, 'CNY')} />
        <Row label="信用贷款负债" value={fmtMoney(credit, 'CNY')} valueColor="var(--credit)" />
        <Row label="长期负债（车贷等）" value={fmtMoney(liabTotal, 'CNY')} valueColor="var(--danger)" />
        <div className="border-t border-soft pt-3 flex justify-between items-center">
          <span className="text-main font-medium">净资产</span>
          <span className="font-semibold text-main">{fmtMoney(nw, 'CNY')}</span>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-sm text-sub">期初现金余额</span>
          <input
            type="number"
            className="input !w-32 text-right"
            value={cashOpening}
            onChange={(e) => setCashOpening(Number(e.target.value) || 0)}
          />
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-sm text-sub">券商期初现金</span>
          <input
            type="number"
            className="input !w-32 text-right"
            value={investCashOpening}
            onChange={(e) => setInvestCashOpening(Number(e.target.value) || 0)}
          />
        </div>
        <p className="text-xs text-faint">
          券商期初现金 = 你开始记账前就已经躺在券商账户里的本金（转账 − 买入 + 卖出 + 分红 的推导起点）。
          只有当「券商现金」显示为负数、且你的银行卡余额与实际相符时才需要填。
          <span className="text-sub">这笔钱不要重复填进「期初现金余额」，否则净资产会多算一份。</span>
        </p>
      </section>

      {/* 长期负债管理 */}
      <LiabilitySection
        liabilities={liabilities}
        transactions={transactions}
        onAdd={(l) => addLiability(l)}
        onUpdate={(l) => updateLiability(l)}
        onDelete={(id) => deleteLiability(id)}
      />

      {/* 分类管理 */}
      <section className="card">
        <h2 className="font-medium text-main mb-3">分类管理</h2>
        <Categories />
      </section>

      {/* 外观 */}
      <section className="card space-y-3">
        <h2 className="font-medium text-main">外观</h2>
        <div className="seg w-full">
          {([['light', '☀️ 浅色'], ['dark', '🌙 深色'], ['system', '📱 跟随系统']] as [ThemeMode, string][]).map(
            ([m, label]) => (
              <button
                key={m}
                onClick={() => setTheme(m)}
                className={`seg-item flex-1 ${settings.theme === m ? 'seg-item-active' : ''}`}
              >
                {label}
              </button>
            )
          )}
        </div>
      </section>

      {/* 持仓成本口径 */}
      <section className="card space-y-3">
        <h2 className="font-medium text-main">持仓成本口径</h2>
        <p className="text-xs text-sub">
          只影响持仓页「成本 / 浮动盈亏」怎么显示，两种口径算出的净资产完全相同。
        </p>
        <div className="seg w-full">
          {(
            [
              ['actual', '真实成本'],
              ['amortized', '摊薄成本'],
            ] as [CostBasis, string][]
          ).map(([b, label]) => (
            <button
              key={b}
              onClick={() => setCostBasis(b)}
              className={`seg-item flex-1 ${costBasis === b ? 'seg-item-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-faint">
          {costBasis === 'actual'
            ? '成本 = 你实际投入的钱；分红单独列为收益。累计分红再多，成本也始终是你投进去的数。'
            : '成本 = 投入的钱 − 累计分红到手（券商 App 常见的「保本价」）。长期高分红股的成本可能摊到 0 甚至负数，届时盈亏率不再显示。'}
        </p>
      </section>

      {/* 应用锁 */}
      <LockSection appLockEnabled={settings.appLockEnabled} onEnable={setPin} onDisable={disableLock} />

      {/* 汇率 */}
      <FxSection
        fxRate={settings.fxRate}
        onUpdate={setFxRate}
        hkdRate={settings.hkdRate}
        onUpdateHkd={setHkdRate}
      />

      {/* 云同步 */}
      <SyncSection />

      {/* 数据 */}
      <DataSection
        onExport={exportData}
        onImport={importData}
        onReset={resetToSeed}
        onClearAll={clearAllData}
        lastBackupAt={settings.lastBackupAt}
      />

      <p className="text-center text-xs text-faint">小金库 · 本地数据 · 隐私优先</p>
    </div>
  )
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sub">{label}</span>
      <span className="font-semibold" style={{ color: valueColor ?? 'var(--text)' }}>{value}</span>
    </div>
  )
}

/* ===== 长期负债 ===== */
function LiabilitySection({
  liabilities,
  transactions,
  onAdd,
  onUpdate,
  onDelete,
}: {
  liabilities: Liability[]
  transactions: Transaction[]
  onAdd: (l: Omit<Liability, 'id' | 'created_at' | 'updated_at'>) => void
  onUpdate: (l: Partial<Liability> & { id: string }) => void
  onDelete: (id: string) => void
}) {
  // 仅管理长期负债（信用贷款为单一资金池，不在列表内编辑）
  const loans = liabilities.filter((l) => l.kind !== 'credit')
  const [editing, setEditing] = useState<Partial<Liability> | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const save = () => {
    if (!editing || !editing.name?.trim()) return
    const data = {
      name: editing.name.trim(),
      kind: 'loan' as const,
      balance: Number(editing.balance) || 0,
      currency: 'CNY' as const,
      monthly_payment: editing.monthly_payment,
      remaining_terms: editing.remaining_terms,
      icon: editing.icon,
      note: editing.note,
    }
    if (editing.id) onUpdate({ id: editing.id, ...data })
    else onAdd(data)
    setEditing(null)
  }
  const onDeleteConfirm = () => {
    if (editing?.id) {
      onDelete(editing.id)
      setEditing(null)
      setConfirmDel(false)
    }
  }
  const repaidForEdit = transactions
    .filter((t) => t.is_repayment && t.liability_id === editing?.id)
    .reduce((s, t) => s + t.amount, 0)
  const editingCurrent = Math.max(0, (editing?.balance ?? 0) - repaidForEdit)
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-main">长期负债</h2>
        <button className="text-sm font-medium" style={{ color: 'var(--accent-strong)' }} onClick={() => setEditing({ name: '', balance: 0, icon: '🚗', kind: 'loan' })}>
          ＋ 新增
        </button>
      </div>
      <div className="space-y-2">
        {loans.map((l) => (
          <button
            key={l.id}
            onClick={() => setEditing({ ...l })}
            className="card-2 w-full text-left flex items-center gap-3 active:bg-[var(--border)]"
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 bg-card-2">
              {l.icon ?? '📦'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-main">{l.name}</div>
              <div className="text-xs text-faint">
                {l.note ? `${l.note} · ` : ''}月供 {fmtMoney(l.monthly_payment ?? 0, 'CNY')} · 剩 {l.remaining_terms ?? '—'} 期
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-semibold" style={{ color: 'var(--danger)' }}>待还 {fmtMoney(liabilityCurrentBalance(l, transactions), 'CNY')}</div>
            </div>
          </button>
        ))}
        {loans.length === 0 && <p className="text-sm text-faint">暂无长期负债</p>}
      </div>

      {editing && (
        <Modal
          title={editing.id ? '编辑负债' : '新增负债'}
          onClose={() => setEditing(null)}
          footer={
            <>
              {editing.id && (
                <button onClick={() => setConfirmDel(true)} className="btn-ghost text-red-500 mr-auto">
                  删除
                </button>
              )}
              <button onClick={() => setEditing(null)} className="btn-ghost">
                取消
              </button>
              <button onClick={save} className="btn-primary">
                保存
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">名称</label>
                <input className="input" value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="如：车贷" />
              </div>
              <div>
                <label className="label">图标</label>
                <div className="flex gap-1 flex-wrap">
                  {LIAB_ICONS.map((ic) => (
                    <button
                      key={ic}
                      onClick={() => setEditing({ ...editing, icon: ic })}
                      className={`w-9 h-9 rounded-lg text-lg ${editing.icon === ic ? '' : 'bg-card-2'}`}
                      style={editing.icon === ic ? { boxShadow: '0 0 0 2px var(--accent)' } : undefined}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">贷款本金（初始）</label>
                <input type="number" className="input" value={editing.balance ?? 0} onChange={(e) => setEditing({ ...editing, balance: Number(e.target.value) })} />
                {editing?.id && (
                  <p className="text-xs text-faint mt-1">
                    已还 {fmtMoney(repaidForEdit, 'CNY')} · 当前待还 {fmtMoney(editingCurrent, 'CNY')}
                  </p>
                )}
              </div>
              <div>
                <label className="label">月供</label>
                <input type="number" className="input" value={editing.monthly_payment ?? ''} onChange={(e) => setEditing({ ...editing, monthly_payment: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">剩余期数</label>
                <input type="number" className="input" value={editing.remaining_terms ?? ''} onChange={(e) => setEditing({ ...editing, remaining_terms: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="label">备注</label>
              <input className="input" value={editing.note ?? ''} onChange={(e) => setEditing({ ...editing, note: e.target.value })} placeholder="如：汽车金融" />
            </div>
          </div>
        </Modal>
      )}
      <ConfirmDialog
        open={confirmDel}
        title="删除负债"
        danger
        message={`确定删除「${editing?.name ?? ''}」吗？已还记录将不再冲减此负债，操作不可撤销。`}
        confirmText="确认删除"
        onConfirm={onDeleteConfirm}
        onCancel={() => setConfirmDel(false)}
      />
    </section>
  )
}

/* ===== 应用锁 ===== */
function LockSection({
  appLockEnabled,
  onEnable,
  onDisable,
}: {
  appLockEnabled: boolean
  onEnable: (pin: string) => void
  onDisable: () => void
}) {
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [err, setErr] = useState('')
  const [confirmLock, setConfirmLock] = useState(false)
  const enable = () => {
    if (pin.length < 4) return setErr('PIN 至少 4 位')
    if (pin !== pin2) return setErr('两次输入不一致')
    onEnable(pin)
    setPin('')
    setPin2('')
    setErr('')
  }
  return (
    <section className="card space-y-3">
      <h2 className="font-medium text-main">应用锁</h2>
      {appLockEnabled ? (
        <>
          <p className="text-sm" style={{ color: 'var(--income)' }}>已启用 PIN 保护</p>
          <button className="btn-outline w-full" onClick={() => setConfirmLock(true)}>
            关闭应用锁
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <input type="password" inputMode="numeric" className="input" placeholder="设置 PIN（至少 4 位）" value={pin} onChange={(e) => { setPin(e.target.value); setErr('') }} />
          <input type="password" inputMode="numeric" className="input" placeholder="再次输入 PIN" value={pin2} onChange={(e) => setPin2(e.target.value)} />
          {err && <p className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>}
          <button className="btn-primary w-full" onClick={enable}>启用应用锁</button>
          <p className="text-xs text-faint">注意：当前为演示用弱哈希，仅防随手查看，并非强加密。</p>
        </div>
      )}
      <ConfirmDialog
        open={confirmLock}
        title="关闭应用锁"
        danger
        message="关闭应用锁后，数据将不再受 PIN 保护，确定关闭吗？"
        confirmText="确认关闭"
        onConfirm={onDisable}
        onCancel={() => setConfirmLock(false)}
      />
    </section>
  )
}

/* ===== 汇率 ===== */
function FxSection({
  fxRate,
  onUpdate,
  hkdRate,
  onUpdateHkd,
}: {
  fxRate: { rate: number; manual: boolean; updated_at: string }
  onUpdate: (r: number, manual: boolean) => void
  hkdRate: { rate: number; manual: boolean; updated_at: string }
  onUpdateHkd: (r: number, manual: boolean) => void
}) {
  const [usdInput, setUsdInput] = useState(String(fxRate.rate))
  const [hkdInput, setHkdInput] = useState(String(hkdRate.rate))
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const updateUsd = () => {
    const r = parseFloat(usdInput)
    if (!r || r <= 0) return setMsg('请输入有效汇率')
    onUpdate(r, true)
    setMsg('USD 汇率已更新（手动）')
  }
  const updateHkd = () => {
    const r = parseFloat(hkdInput)
    if (!r || r <= 0) return setMsg('请输入有效汇率')
    onUpdateHkd(r, true)
    setMsg('HKD 汇率已更新（手动）')
  }
  const fetchFx = async () => {
    setBusy(true)
    setMsg('获取中…')
    try {
      const fx = await fetchFxRates()
      if (fx && fx.usdRate > 0 && fx.hkdRate > 0) {
        onUpdate(fx.usdRate, false)
        onUpdateHkd(fx.hkdRate, false)
        setUsdInput(String(fx.usdRate))
        setHkdInput(String(fx.hkdRate))
        setMsg(`已自动获取：USD ${fx.usdRate} · HKD ${fx.hkdRate}`)
      } else {
        setMsg('未获取到汇率，可手动填写')
      }
    } catch {
      setMsg('获取失败（可手动填写）')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="card space-y-3">
      <h2 className="font-medium text-main">汇率（外币 → CNY）</h2>
      <div className="space-y-3">
        <div>
          <div className="flex items-center gap-2 text-sm mb-1">
            <span className="text-sub">USD 当前</span>
            <span className="font-semibold text-main">¥{fxRate.rate} / $1</span>
            <span className="text-xs text-faint">{fxRate.manual ? '手动' : '自动'} · {fxRate.updated_at.slice(0, 10)}</span>
          </div>
          <div className="flex gap-2">
            <input type="number" step="0.0001" className="input" value={usdInput} onChange={(e) => setUsdInput(e.target.value)} placeholder="USD→CNY" />
            <button className="btn-primary" onClick={updateUsd}>更新</button>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 text-sm mb-1">
            <span className="text-sub">HKD 当前</span>
            <span className="font-semibold text-main">¥{hkdRate.rate} / HK$1</span>
            <span className="text-xs text-faint">{hkdRate.manual ? '手动' : '自动'} · {hkdRate.updated_at.slice(0, 10)}</span>
          </div>
          <div className="flex gap-2">
            <input type="number" step="0.0001" className="input" value={hkdInput} onChange={(e) => setHkdInput(e.target.value)} placeholder="HKD→CNY" />
            <button className="btn-primary" onClick={updateHkd}>更新</button>
          </div>
        </div>
      </div>
      <button className="btn-outline w-full" onClick={fetchFx} disabled={busy}>
        {busy ? '获取中…' : '↻ 刷新汇率'}
      </button>
      <p className="text-xs text-faint">
        提示：在「持仓总览」点击「↻ 刷新行情」也会一并刷新汇率。
      </p>
      {msg && <p className="text-xs text-faint">{msg}</p>}
    </section>
  )
}

/* ===== 数据 ===== */
/* ===== 云同步（自建服务器） ===== */
function SyncSection() {
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
    else setTestMsg('连接成功' + (r.kind === 'empty' ? '（服务器暂无数据）' : '（服务器已有数据）'))
    setTesting(false)
  }

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-main">云同步（自建服务器）</h2>
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
        <p className="text-xs" style={{ color: testMsg.startsWith('连接成功') ? 'var(--income)' : 'var(--danger)' }}>
          {testMsg}
        </p>
      )}
      {syncError && <p className="text-xs" style={{ color: 'var(--danger)' }}>同步失败：{syncError}</p>}
      <p className="text-xs text-faint">
        {sync.lastSyncAt
          ? `最近同步：${sync.lastSyncAt.slice(0, 10)} ${sync.lastSyncAt.slice(11, 16)} · 服务器版本 ${sync.version}`
          : '尚未同步过。启用后改动会自动上传，打开应用时会自动下载。'}
      </p>
      <p className="text-xs text-faint">
        数据以整份 JSON 存在你自己的服务器；两端同时改动时会弹窗让你选择保留哪一份，不会静默覆盖。
      </p>
    </section>
  )
}

function DataSection({
  onExport,
  onImport,
  onReset,
  onClearAll,
  lastBackupAt,
}: {
  onExport: () => any
  onImport: (d: any) => void
  onReset: () => void
  onClearAll: () => void
  lastBackupAt?: string
}) {
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
        navigator.clipboard.writeText(text).then(() => showToast('已复制到剪贴板'), () => fallbackCopy(text))
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
        if (d.app === 'xiaojinku') { onImport(d); showToast('导入成功') } else showToast('文件格式不正确')
      } catch {
        showToast('解析失败，请检查文件')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }
  const handleExport = () => {
    const data = onExport()
    const json = JSON.stringify(data, null, 2)
    // 触发下载（file:// 或允许下载的环境）
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
    // 记录备份时间，用于概览页的备份提醒
    useStore.getState().markBackup()
    // 弹窗展示，便于在受限预览里手动复制保存
    setExportText(json)
  }
  const onResetClick = () => setConfirmReset(true)
  const onClearClick = () => setConfirmClear(true)
  const backupText = lastBackupAt
    ? `${lastBackupAt.slice(0, 10)}（${Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / 86400000)} 天前）`
    : '从未备份'
  return (
    <section className="card space-y-3">
      <h2 className="font-medium text-main">数据与隐私</h2>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-outline" onClick={handleExport}>导出 JSON</button>
        <label className="btn-outline text-center cursor-pointer">
          导入 JSON
          <input type="file" accept="application/json" className="hidden" onChange={onImportFile} />
        </label>
      </div>
      <p className="text-xs text-faint">上次备份：{backupText}</p>
      <button className="btn-outline w-full text-red-500" onClick={onClearClick}>清空全部数据（留空账本）</button>
      <button className="btn-outline w-full" onClick={onResetClick}>清空并恢复示例数据</button>
      <p className="text-xs text-faint">数据保存在本浏览器（IndexedDB），不上传任何服务器。</p>

      {exportText && (
        <Modal title="导出数据（JSON）" onClose={() => setExportText('')}>
          <p className="text-xs text-faint mb-2">
            若上方未自动下载，可点击下方「复制」并在本机保存为 <code>.json</code> 文件（建议配合从本机双击打开本应用以便直接下载）。
          </p>
          <textarea
            readOnly
            value={exportText}
            className="input h-56 w-full font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex gap-2 mt-3">
            <button className="btn-primary flex-1" onClick={() => copyText(exportText)}>复制全部</button>
            <button className="btn-ghost flex-1" onClick={() => setExportText('')}>关闭</button>
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
        onConfirm={onReset}
        onCancel={() => setConfirmReset(false)}
      />
      <ConfirmDialog
        open={confirmClear}
        title="清空全部数据"
        danger
        message="将删除全部流水、负债与投资记录，保留分类设置，得到一个可以直接开始记账的空账本。此操作不可撤销，建议先导出备份。"
        confirmText="确认清空"
        onConfirm={onClearAll}
        onCancel={() => setConfirmClear(false)}
      />
    </section>
  )
}

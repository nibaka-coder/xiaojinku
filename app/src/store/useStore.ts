import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '@/lib/storage'
import { uid } from '@/lib/id'
import { nowLocalISO } from '@/lib/date'
import { hashPin } from '@/lib/pin'
import { getInitialState, type InitialState } from '@/lib/seed'
import { fetchPrice, fetchFxRates, type FxRates } from '@/lib/quoteService'
import type {
  Liability,
  Category,
  Transaction,
  Settings,
  ExportData,
  Currency,
  FundSource,
  ThemeMode,
  Security,
  InvestTxn,
  SyncConfig,
} from '@/types'

type NewLiability = Omit<Liability, 'id' | 'created_at' | 'updated_at'>
type UpdateLiability = Partial<NewLiability> & { id: string }
type NewCategory = Omit<Category, 'id' | 'order'>
type UpdateCategory = Partial<Omit<Category, 'id'>> & { id: string }
type NewTransaction = Omit<Transaction, 'id' | 'created_at' | 'updated_at'>
type UpdateTransaction = Partial<NewTransaction> & { id: string }
type NewSecurity = Omit<Security, 'id' | 'created_at' | 'updated_at'>
type UpdateSecurity = Partial<NewSecurity> & { id: string }
type NewInvestTxn = Omit<InvestTxn, 'id' | 'created_at' | 'updated_at'>
type UpdateInvestTxn = Partial<NewInvestTxn> & { id: string }

interface AppState extends InitialState {
  addLiability: (data: NewLiability) => void
  updateLiability: (data: UpdateLiability) => void
  deleteLiability: (id: string) => void

  addCategory: (data: NewCategory) => void
  updateCategory: (data: UpdateCategory) => void
  deleteCategory: (id: string) => void

  addTransaction: (data: NewTransaction) => void
  updateTransaction: (data: UpdateTransaction) => void
  deleteTransaction: (id: string) => void
  // 信用还款：现金流出 + 冲减信用贷款负债
  addRepayment: (amount: number, datetime: string, note?: string) => void

  // 投资管理
  addSecurity: (data: NewSecurity) => string
  updateSecurity: (data: UpdateSecurity) => void
  deleteSecurity: (id: string) => void
  addInvestTxn: (data: NewInvestTxn) => void
  updateInvestTxn: (data: UpdateInvestTxn) => void
  deleteInvestTxn: (id: string) => void
  // 行情刷新：默认仅刷新当天未取的；force=true 强制全量刷新
  refreshQuotes: (force?: boolean) => Promise<void>

  setFxRate: (rate: number, manual: boolean) => void
  setHkdRate: (rate: number, manual: boolean) => void
  setDefaultCurrency: (c: Currency) => void
  setTheme: (t: ThemeMode) => void
  setCashOpening: (n: number) => void

  setPin: (pin: string) => void
  verifyPin: (pin: string) => boolean
  enableLock: (pin: string) => void
  disableLock: () => void

  exportData: () => ExportData
  importData: (d: ExportData) => void
  resetToSeed: () => void
  // 清空全部数据，保留一个空账本（不含示例数据）
  clearAllData: () => void

  // 云同步（自建服务器）
  setSyncConfig: (patch: Partial<SyncConfig>) => void
  markBackup: () => void
  markSynced: (version: number) => void
  applyRemote: (d: ExportData, version: number) => void
}

export type { SyncConfig }

const touch = () => nowLocalISO()

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...getInitialState(),

      addLiability: (data) =>
        set((s) => ({
          liabilities: [
            ...s.liabilities,
            { ...data, id: uid('liab_'), created_at: touch(), updated_at: touch() } as Liability,
          ],
          settings: { ...s.settings, isSeed: false },
        })),

      updateLiability: (data) =>
        set((s) => ({
          liabilities: s.liabilities.map((l) =>
            l.id === data.id ? ({ ...l, ...data, updated_at: touch() } as Liability) : l
          ),
        })),

      deleteLiability: (id) =>
        set((s) => ({ liabilities: s.liabilities.filter((l) => l.id !== id) })),

      addCategory: (data) =>
        set((s) => {
          const maxOrder = Math.max(0, ...s.categories.map((c) => c.order))
          return {
            categories: [
              ...s.categories,
              { ...data, id: uid('cat_'), order: maxOrder + 1 } as Category,
            ],
            settings: { ...s.settings, isSeed: false },
          }
        }),

      updateCategory: (data) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === data.id ? ({ ...c, ...data } as Category) : c
          ),
        })),

      deleteCategory: (id) =>
        set((s) => ({
          categories: s.categories.filter((c) => c.id !== id),
          transactions: s.transactions.map((t) =>
            t.category_id === id ? { ...t, category_id: undefined } : t
          ),
        })),

      addTransaction: (data) =>
        set((s) => ({
          transactions: [
            ...s.transactions,
            { ...data, id: uid('txn_'), created_at: touch(), updated_at: touch() } as Transaction,
          ],
          settings: { ...s.settings, isSeed: false },
        })),

      updateTransaction: (data) =>
        set((s) => ({
          transactions: s.transactions.map((t) =>
            t.id === data.id ? ({ ...t, ...data, updated_at: touch() } as Transaction) : t
          ),
        })),

      deleteTransaction: (id) =>
        set((s) => ({
          transactions: s.transactions.filter((t) => t.id !== id),
        })),

      addRepayment: (amount, datetime, note) =>
        set((s) => ({
          transactions: [
            ...s.transactions,
            {
              id: uid('txn_'),
              datetime,
              type: 'expense',
              amount,
              currency: 'CNY',
              fund_source: 'cash',
              is_repayment: true,
              note: note || '信用还款',
              created_at: touch(),
              updated_at: touch(),
            } as Transaction,
          ],
        })),

      // ===== 投资管理 =====
      addSecurity: (data) => {
        const id = uid('sec_')
        set((s) => ({
          securities: [
            ...s.securities,
            { ...data, id, created_at: touch(), updated_at: touch() } as Security,
          ],
          settings: { ...s.settings, isSeed: false },
        }))
        return id
      },

      updateSecurity: (data) =>
        set((s) => ({
          securities: s.securities.map((l) =>
            l.id === data.id ? ({ ...l, ...data, updated_at: touch() } as Security) : l
          ),
        })),

      deleteSecurity: (id) =>
        set((s) => ({
          securities: s.securities.filter((l) => l.id !== id),
          // 同时清理该证券的交易台账
          investTxns: s.investTxns.filter((t) => t.security_id !== id),
        })),

      addInvestTxn: (data) =>
        set((s) => ({
          investTxns: [
            ...s.investTxns,
            { ...data, id: uid('itx_'), created_at: touch(), updated_at: touch() } as InvestTxn,
          ],
          settings: { ...s.settings, isSeed: false },
        })),

      updateInvestTxn: (data) =>
        set((s) => ({
          investTxns: s.investTxns.map((t) =>
            t.id === data.id ? ({ ...t, ...data, updated_at: touch() } as InvestTxn) : t
          ),
        })),

      deleteInvestTxn: (id) =>
        set((s) => ({
          investTxns: s.investTxns.filter((t) => t.id !== id),
        })),

      refreshQuotes: async (force) => {
        const { securities, settings } = get()
        const fxRate = settings.fxRate.rate
        const today = new Date().toISOString().slice(0, 10)
        const toRefresh = securities.filter(
          (s) => force || !s.lastPrice || (s.quoteUpdatedAt || '').slice(0, 10) !== today
        )
        // 汇率与行情并行刷新（失败则保留原值/手动输入），不拖慢行情
        const fxPromise: Promise<FxRates | null> = fetchFxRates().catch(() => null)
        for (const s of toRefresh) {
          const r = await fetchPrice(s.secid, s.market)
          if (r && r.price > 0) {
            // 用户未填名称（为空）或仅填了代码本身时，用行情接口返回的真实名称覆盖
            const resolvedName =
              r.name && (!s.name || s.name === s.code) ? r.name : s.name || r.name
            get().updateSecurity({
              id: s.id,
              lastPrice: r.price,
              quoteUpdatedAt: nowLocalISO(),
              name: resolvedName,
              dayChangePct: r.changePct,
            })
          }
        }
        // 汇率结果（与上面行情刷新并行跑）
        try {
          const fx = await fxPromise
          if (fx && fx.usdRate > 0 && fx.hkdRate > 0) {
            get().setFxRate(fx.usdRate, false)
            get().setHkdRate(fx.hkdRate, false)
          }
        } catch {
          /* 忽略汇率失败，不影响行情刷新 */
        }
      },

      setFxRate: (rate, manual) =>
        set((s) => ({
          settings: { ...s.settings, fxRate: { rate, manual, updated_at: touch() } },
        })),

      setHkdRate: (rate, manual) =>
        set((s) => ({
          settings: { ...s.settings, hkdRate: { rate, manual, updated_at: touch() } },
        })),

      setDefaultCurrency: (c) =>
        set((s) => ({ settings: { ...s.settings, defaultCurrency: c } })),

      setTheme: (t) => set((s) => ({ settings: { ...s.settings, theme: t } })),

      setCashOpening: (n) =>
        set((s) => ({ settings: { ...s.settings, cashOpening: n } })),

      setPin: (pin) =>
        set((s) => ({
          settings: { ...s.settings, pinHash: hashPin(pin), appLockEnabled: true },
        })),

      verifyPin: (pin) => {
        const h = get().settings.pinHash
        if (!h) return false
        return h === hashPin(pin)
      },

      enableLock: (pin) =>
        set((s) => ({
          settings: { ...s.settings, pinHash: hashPin(pin), appLockEnabled: true },
        })),

      disableLock: () =>
        set((s) => ({
          settings: { ...s.settings, pinHash: undefined, appLockEnabled: false },
        })),

      exportData: () => {
        const s = get()
        return {
          app: 'xiaojinku',
          version: 2,
          exported_at: touch(),
          liabilities: s.liabilities,
          categories: s.categories,
          transactions: s.transactions,
          securities: s.securities,
          investTxns: s.investTxns,
          settings: s.settings,
        }
      },

      importData: (d) =>
        set((s) => ({
          liabilities: d.liabilities ?? [],
          categories: d.categories ?? [],
          transactions: d.transactions ?? [],
          securities: d.securities ?? [],
          investTxns: d.investTxns ?? [],
          // 导入他人/他设备的数据时，保留本机的服务器地址与令牌、备份时间（这些属于本机配置）
          settings: {
            ...(d.settings ?? getInitialState().settings),
            sync: s.settings.sync,
            lastBackupAt: s.settings.lastBackupAt,
          },
        })),

      resetToSeed: () =>
        set((s) => ({ ...getInitialState(), settings: { ...getInitialState().settings, sync: s.settings.sync } })),

      // 清空全部数据，保留一个空账本（不重新生成示例数据）
      // 注意：保留分类——分类是账本结构而非记录，删掉会导致无法记账；
      // 同时保留同步/外观/应用锁等本机配置。
      clearAllData: () =>
        set((s) => ({
          liabilities: [],
          transactions: [],
          securities: [],
          investTxns: [],
          settings: {
            ...s.settings,
            cashOpening: 0,
            appLockEnabled: s.settings.appLockEnabled,
            pinHash: s.settings.pinHash,
            // 用户主动清空的账本不再是「未动过的示例数据」
            isSeed: false,
          },
        })),

      setSyncConfig: (patch) =>
        set((s) => ({ settings: { ...s.settings, sync: { ...s.settings.sync, ...patch } } })),

      markBackup: () =>
        set((s) => ({ settings: { ...s.settings, lastBackupAt: touch() } })),

      markSynced: (version) =>
        set((s) => ({
          settings: {
            ...s.settings,
            sync: { ...s.settings.sync, version, lastSyncAt: touch() },
          },
        })),

      // 应用服务器数据（用于拉取/冲突时选择服务器版本）
      applyRemote: (d, version) =>
        set((s) => ({
          liabilities: d.liabilities ?? [],
          categories: d.categories ?? [],
          transactions: d.transactions ?? [],
          securities: d.securities ?? [],
          investTxns: d.investTxns ?? [],
          settings: {
            ...(d.settings ?? s.settings),
            sync: { ...s.settings.sync, version, lastSyncAt: touch() },
            lastBackupAt: s.settings.lastBackupAt,
          },
        })),
    }),
    {
      name: 'xiaojinku-store',
      version: 5,
      storage: createJSONStorage(() => idbStorage),
      // 版本升级时补默认值/修正旧数据，避免缺字段或废弃枚举导致崩溃（保留其余数据）
      migrate: (persisted: any, version: number) => {
        if (version < 3 && persisted?.settings) {
          persisted.settings.hkdRate =
            persisted.settings.hkdRate ?? { rate: 0.915, updated_at: new Date().toISOString(), manual: true }
        }
        // v4：投资交易类型「建仓(open)」已并入「买入(buy)」，旧数据迁移，否则持仓会漏算
        if (version < 4 && Array.isArray(persisted?.investTxns)) {
          persisted.investTxns = persisted.investTxns.map((t: any) =>
            t && t.type === 'open' ? { ...t, type: 'buy' } : t
          )
        }
        // v5：新增云同步配置与备份时间戳
        if (version < 5 && persisted?.settings) {
          persisted.settings.sync = persisted.settings.sync ?? {
            enabled: false,
            url: '',
            token: '',
            version: 0,
          }
          // 兼容早期把 lastBackupAt 放在 sync 里的情况
          if (!persisted.settings.lastBackupAt && persisted.settings.sync?.lastBackupAt) {
            persisted.settings.lastBackupAt = persisted.settings.sync.lastBackupAt
          }
          delete persisted.settings.sync.lastBackupAt
        }
        return persisted
      },
      partialize: (s) => ({
        liabilities: s.liabilities,
        categories: s.categories,
        transactions: s.transactions,
        securities: s.securities,
        investTxns: s.investTxns,
        settings: s.settings,
      }),
    }
  )
)

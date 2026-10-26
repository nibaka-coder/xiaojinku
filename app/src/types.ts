export type Currency = 'CNY' | 'USD' | 'HKD'

// 资金来源：现金 / 信用贷款（不细化到具体银行卡/微信/支付宝）
export type FundSource = 'cash' | 'credit'

// 负债：信用周转类（信用卡/花呗）与长期分期类（车贷/房贷等）
// kind='credit'：余额由交易驱动（信用消费 +、还款 −），为单一资金池，不细分具体卡
// kind='loan'：balance 为初始本金，当前待还 = 本金 − 已还（已还由还款交易推导）
export interface Liability {
  id: string
  name: string
  kind: 'credit' | 'loan'
  balance: number // kind='loan' 时为初始本金；kind='credit' 时忽略（由交易推导）
  currency: Currency
  monthly_payment?: number // 月供（仅展示用）
  remaining_terms?: number // 剩余期数（仅展示用）
  icon?: string
  note?: string
  created_at: string
  updated_at: string
}

export type TxnType = 'expense' | 'income'

export interface Transaction {
  id: string
  datetime: string
  type: TxnType
  amount: number
  currency: Currency // 日常开销恒为 CNY
  fund_source: FundSource
  category_id?: string
  payee?: string
  note?: string
  // 信用还款：现金流出 + 冲减对应负债余额（liability_id 指向具体负债）
  is_repayment?: boolean
  liability_id?: string // 还款所冲减的负债 id（信用池为 'credit_pool'）
  // 投资转账：现金与券商账户间的划款（转出/回收），仅影响现金余额，不计入日常开销/分类统计
  is_investment_transfer?: boolean
  // 摊销（车险/年度会员等一次性支付、按区间分摊成本的支出）：
  // 标记后，统计口径下该笔按「总额 ÷ 期数」分摊到各月（末月承担尾差，总额不变）；
  // 现金余额与净资产仍按实际付款日与全额计算（钱确实当天出去了）。
  amortize_start_ym?: string // 起摊月，如 2026-07
  amortize_months?: number // 摊销期数（月），如 12
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  name: string
  type: 'expense' | 'income'
  icon: string
  color: string
  is_system: boolean
  order: number
}

export interface FxRate {
  rate: number
  updated_at: string
  manual: boolean
}

export type ThemeMode = 'light' | 'dark' | 'system'

// 云同步配置（自建服务器，整份数据 JSON 同步）
export interface SyncConfig {
  enabled: boolean
  url: string // 服务端接口地址，如 https://money.xxx.com/api.php
  token: string // 自设的访问令牌
  version: number // 已同步到的服务器版本号（冲突检测基准）
  lastSyncAt?: string // 最近一次成功同步时间 ISO
}

export interface Settings {
  appLockEnabled: boolean
  pinHash?: string
  defaultCurrency: Currency
  fxRate: FxRate
  hkdRate: FxRate // HKD → CNY（港股用，独立于 USD 汇率）
  currencySymbolUSD: string
  currencySymbolCNY: string
  theme: ThemeMode
  cashOpening: number // 期初现金余额（CNY）
  // 券商期初现金（CNY）：开始记账前就已经在券商账户里的自有资金。
  // 只填「不属于银行卡期初现金」的那部分——若已算进 cashOpening 会造成重复计算。
  investCashOpening?: number
  // 持仓成本口径：默认 actual（真实成本）
  costBasis?: CostBasis
  // 分红助手：上次静默检查时间 ISO（节流用，7 天内不重复请求）
  dividendScanAt?: string
  // 分红助手：用户标记「忽略」的分红去重键列表（键 = 证券ID|除权日|类型）
  dividendIgnored?: string[]
  sync: SyncConfig
  lastBackupAt?: string // 最近一次导出备份时间 ISO（用于备份提醒）
  // 本账本是否仍是「未动过的示例数据」。新设备首次打开会带示例数据，
  // 用它区分「真正的新设备」与「用户在用的账本」，避免首次同步误判为冲突。
  isSeed?: boolean
}

// 证券市场：A股 / 美股 / 港股 / ETF（ETF 行情同 A股 secid 规则）
export type Market = 'ashare' | 'us' | 'hk' | 'etf'

// 证券：持仓的标的定义。现价优先取行情，取不到降级 manualPrice
export interface Security {
  id: string
  code: string // 代码，如 600519 / AAPL / 00700
  name: string // 名称
  market: Market
  currency: Currency // 美股为 USD，港股为 HKD，A股/ETF 为 CNY
  secid: string // 东财行情主键，如 1.600519 / 105.AAPL / 116.00700
  manualPrice?: number // 手动维护现价（行情兜底）
  lastPrice?: number // 最近一次行情价（原币），随刷新更新
  quoteUpdatedAt?: string // 最近行情更新时间 ISO
  dayChangePct?: number // 当日涨跌幅(%)，随刷新更新
  note?: string
  created_at: string
  updated_at: string
}

// 投资交易类型：买入 / 卖出 / 分红（原「建仓」已并入买入，旧数据迁移为 buy）
// 投资交易类型：买入 / 卖出 / 分红 / 送股拆股
// 原「建仓」已并入买入，旧数据迁移为 buy
// split（送股 / 转增 / 拆股）：只增减股数、不动总成本 → 每股成本自动摊薄
//   送股填正数（如 10 送 10，持 1000 股填 1000），合股/缩股填负数
export type InvestTxnType = 'buy' | 'sell' | 'dividend' | 'split'

// 持仓成本口径：
// actual    = 真实成本（口径 A）：成本就是投入的钱，分红单列为收益
// amortized = 摊薄成本（口径 B）：成本 = 真实成本 − 累计分红到手（券商 App 的「保本价」）
// 两者净资产完全相同，差别只在持仓页「成本 / 浮动盈亏」怎么显示
export type CostBasis = 'actual' | 'amortized'

// 投资交易台账：唯一数据源，持仓由它推导
export interface InvestTxn {
  id: string
  security_id: string
  type: InvestTxnType
  datetime: string
  shares: number // 股数（分红可为 0）
  price: number // 成交单价（原币）
  fee: number // 费用（原币，默认 0）
  currency: Currency
  note?: string
  // 卖出时手动指定的配对批次：lotId 对应买入交易 id，shares 为该批卖出股数
  matchedLots?: { lotId: string; shares: number }[]
  created_at: string
  updated_at: string
}

export interface ExportData {
  app: 'xiaojinku'
  version: number
  exported_at: string
  liabilities: Liability[]
  categories: Category[]
  transactions: Transaction[]
  securities: Security[]
  investTxns: InvestTxn[]
  settings: Settings
}

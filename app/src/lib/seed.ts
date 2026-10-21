import type {
  Liability,
  Category,
  Transaction,
  Settings,
  Security,
  InvestTxn,
} from '@/types'
import { uid } from '@/lib/id'
import { nowLocalISO, todayDateISO } from '@/lib/date'

function isoOnDay(day: number, hour = 10, minute = 0): string {
  const [y, m] = todayDateISO().split('-')
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${y}-${m}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`
}

export interface InitialState {
  liabilities: Liability[]
  categories: Category[]
  transactions: Transaction[]
  securities: Security[]
  investTxns: InvestTxn[]
  settings: Settings
}

export function getInitialState(): InitialState {
  const now = nowLocalISO()

  // 负债：信用贷款（单一资金池，余额由交易推导）+ 长期负债（车贷，余额=本金−已还）
  const liabilities: Liability[] = [
    {
      id: 'credit_pool',
      name: '信用贷款',
      kind: 'credit',
      balance: 0,
      currency: 'CNY',
      icon: '💳',
      note: '信用卡 / 花呗等',
      created_at: now,
      updated_at: now,
    },
    {
      id: uid('liab_'),
      name: '车贷',
      kind: 'loan',
      balance: 86800,
      currency: 'CNY',
      monthly_payment: 3200,
      remaining_terms: 27,
      icon: '🚗',
      note: '汽车金融',
      created_at: now,
      updated_at: now,
    },
  ]

  let order = 0
  const mkCat = (
    id: string,
    name: string,
    type: 'expense' | 'income',
    icon: string,
    color: string
  ): Category => ({
    id,
    name,
    type,
    icon,
    color,
    is_system: true,
    order: order++,
  })

  const categories: Category[] = [
    mkCat('cat_food', '餐饮', 'expense', '🍜', '#ec9a8e'),
    mkCat('cat_transport', '交通', 'expense', '🚌', '#7bbbac'),
    mkCat('cat_shopping', '购物', 'expense', '🛍️', '#c3a3df'),
    mkCat('cat_home', '居住', 'expense', '🏠', '#e6b25a'),
    mkCat('cat_fun', '娱乐', 'expense', '🎮', '#7cc6a6'),
    mkCat('cat_medical', '医疗', 'expense', '💊', '#e5736b'),
    mkCat('cat_other_exp', '其他', 'expense', '📦', '#9aa0b0'),
    mkCat('cat_salary', '工资', 'income', '💰', '#7cc6a6'),
    mkCat('cat_invest_inc', '理财收益', 'income', '📈', '#5fa896'),
    mkCat('cat_other_inc', '其他收入', 'income', '✨', '#c3a3df'),
  ]

  const foodId = 'cat_food'
  const transId = 'cat_transport'
  const shopId = 'cat_shopping'
  const homeId = 'cat_home'
  const funId = 'cat_fun'
  const salaryId = 'cat_salary'

  const T = (
    type: Transaction['type'],
    amount: number,
    fund_source: Transaction['fund_source'],
    day: number,
    extra: Partial<Transaction> = {}
  ): Transaction => ({
    id: uid('txn_'),
    datetime: isoOnDay(day, 9 + (day % 9), (day * 7) % 60),
    type,
    amount,
    currency: 'CNY',
    fund_source,
    category_id: extra.category_id,
    payee: extra.payee,
    note: extra.note,
    is_repayment: extra.is_repayment,
    liability_id: extra.liability_id,
    created_at: now,
    updated_at: now,
  })

  const securities: Security[] = [
    {
      id: uid('sec_'),
      code: '600519',
      name: '贵州茅台',
      market: 'ashare',
      currency: 'CNY',
      secid: '1.600519',
      manualPrice: 1685,
      note: '示例持仓',
      created_at: now,
      updated_at: now,
    },
    {
      id: uid('sec_'),
      code: 'AAPL',
      name: '苹果公司',
      market: 'us',
      currency: 'USD',
      secid: '105.AAPL',
      manualPrice: 230,
      note: '示例持仓',
      created_at: now,
      updated_at: now,
    },
  ]
  const maotaiId = securities[0].id
  const aaplId = securities[1].id

  const investTxns: InvestTxn[] = [
    {
      id: uid('itx_'),
      security_id: maotaiId,
      type: 'buy',
      datetime: isoOnDay(5, 10, 0),
      shares: 100,
      price: 1600,
      fee: 0,
      currency: 'CNY',
      note: '买入',
      created_at: now,
      updated_at: now,
    },
    {
      id: uid('itx_'),
      security_id: aaplId,
      type: 'buy',
      datetime: isoOnDay(8, 14, 0),
      shares: 50,
      price: 190,
      fee: 0,
      currency: 'USD',
      note: '买入',
      created_at: now,
      updated_at: now,
    },
  ]

  const transactions: Transaction[] = [
    T('income', 18500, 'cash', 1, { category_id: salaryId, payee: '公司' }),
    T('expense', 3000, 'cash', 3, { category_id: homeId, payee: '房东', note: '房租' }),
    T('expense', 42, 'cash', 4, { category_id: foodId, payee: '麦当劳' }),
    T('expense', 128, 'cash', 5, { category_id: shopId, payee: '淘宝' }),
    T('expense', 30, 'cash', 6, { category_id: transId, payee: '地铁' }),
    T('expense', 88, 'cash', 8, { category_id: foodId, payee: '午饭' }),
    T('expense', 198, 'cash', 9, { category_id: funId, payee: '电影票' }),
    T('expense', 260, 'credit', 12, { category_id: foodId, payee: '聚餐' }),
    T('expense', 1280, 'credit', 14, { category_id: shopId, payee: '数码店' }),
    T('expense', 1000, 'cash', 16, { is_repayment: true, liability_id: 'credit_pool', payee: '信用卡还款', note: '还信用贷款' }),
    T('expense', 56, 'cash', 17, { category_id: foodId, payee: '晚餐' }),
    T('expense', 240, 'cash', 20, { category_id: shopId, payee: '京东' }),
    T('expense', 35, 'cash', 22, { category_id: transId, payee: '打车' }),
    T('expense', 66, 'cash', 24, { category_id: foodId, payee: '奶茶' }),
    // 投资转账（转出券商）：仅影响现金余额，不计入日常开销/预算
    {
      id: uid('txn_'),
      datetime: isoOnDay(5, 10, 5),
      type: 'expense',
      amount: 160000,
      currency: 'CNY',
      fund_source: 'cash',
      is_investment_transfer: true,
      note: '券商转入 · 贵州茅台',
      created_at: now,
      updated_at: now,
    },
    {
      id: uid('txn_'),
      datetime: isoOnDay(8, 14, 5),
      type: 'expense',
      amount: 67640,
      currency: 'CNY',
      fund_source: 'cash',
      is_investment_transfer: true,
      note: '券商转入 · 苹果公司',
      created_at: now,
      updated_at: now,
    },
  ]

  const settings: Settings = {
    appLockEnabled: false,
    defaultCurrency: 'CNY',
    fxRate: { rate: 7.12, updated_at: now, manual: true },
    hkdRate: { rate: 0.915, updated_at: now, manual: true },
    currencySymbolUSD: '$',
    currencySymbolCNY: '¥',
    theme: 'light',
    cashOpening: 300000,
    sync: { enabled: false, url: '', token: '', version: 0 },
    lastBackupAt: undefined,
    isSeed: true,
  }

  return { liabilities, categories, transactions, securities, investTxns, settings }
}

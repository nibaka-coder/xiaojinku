import type { CSSProperties, ReactNode } from 'react'

/**
 * 全站统一线性图标：24 格、1.75 线宽、圆角端点、currentColor。
 * 颜色只由所在容器的状态决定，图标本身不带颜色，避免多处色源导致的杂乱。
 *
 * 数据层（分类/负债的 icon 字段）仍存旧的 emoji 字符串，导出格式与老账本不变；
 * 统一在渲染层用 <Glyph value={...} /> 映射，未命中时回退到通用图标。
 */

const ICONS: Record<string, ReactNode> = {
  // 导航 / 框架
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.34a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.64 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64h.08A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.36 9v.08a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  leaf: <><path d="M11 20A7 7 0 0 1 4 13c0-6 6-9 16-9 0 10-3 16-9 16z" /><path d="M4 20c3-5 7-8 12-10" /></>,
  receipt: <><path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" /><path d="M9 8h6M9 12h6" /></>,
  chart: <><path d="M4 19V5M4 19h16" /><path d="m7 14 4-4 3 2 4-5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  trash: <><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" /></>,
  chevron: <><path d="m9 5 7 7-7 7" /></>,
  chevronDown: <><path d="m5 9 7 7 7-7" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  check: <><path d="m5 12 5 5 9-9" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-1.6 5" /><path d="M20 5v6h-6" /></>,
  warning: <><path d="M12 3 2 20h20z" /><path d="M12 9v5M12 17h.01" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  pin: <><path d="M9 3h6l-1 6 4 3v2H6v-2l4-3z" /><path d="M12 14v7" /></>,
  tag: <><path d="M3 11V4h7l11 11-7 7z" /><circle cx="7.5" cy="7.5" r="1" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .8-1.5 1.3-1.5 2.5M12 17h.01" /></>,

  // 数据 / 资产
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 14h2" /></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>,
  banknote: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M5 9h.01M19 15h.01" /></>,
  car: <><path d="M5 16h14M6 16V9l2-4h8l2 4v7" /><path d="M4 16v2h3v-2M17 16v2h3v-2" /><circle cx="9" cy="13" r="1" /><circle cx="15" cy="13" r="1" /></>,
  folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" /></>,
  box: <><path d="M3 7 12 3l9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></>,
  palette: <><path d="M12 3a9 9 0 0 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a2 2 0 1 1 2-2 1.5 1.5 0 0 0 3 0 9 9 0 0 0-5-13z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  exchange: <><path d="M4 8h14l-3-3M20 16H6l3 3" /></>,
  cloud: <><path d="M7 18a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.6 1.5A3.5 3.5 0 0 1 17 18z" /></>,
  inbox: <><path d="M4 4h16v11h-5l-1 2h-4l-1-2H4z" /><path d="M12 6v6m-3-3 3 3 3-3" /></>,
  outbox: <><path d="M4 4h16v11h-5l-1 2h-4l-1-2H4z" /><path d="M12 12V6m-3 3 3-3 3 3" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <><path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z" /></>,
  smartphone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,

  // 分类
  bowl: <><path d="M4 11h16a8 8 0 0 1-16 0z" /><path d="M8 7c0-1 1-2 1-2M12 7c0-1.4 1-2.5 1-2.5M16 7c0-1 1-2 1-2" /><path d="M3 21h18" /></>,
  bus: <><rect x="5" y="3" width="14" height="15" rx="2" /><path d="M5 11h14M8 18v2M16 18v2" /><circle cx="9" cy="15" r="1" /><circle cx="15" cy="15" r="1" /></>,
  bag: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  coffee: <><path d="M5 8h12v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" /><path d="M17 9h2a2 2 0 0 1 0 4h-2M4 21h15" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5M10 21v-6h4v6" /></>,
  game: <><path d="M7 8h10a4 4 0 0 1 4 4v3a3 3 0 0 1-5.2 2l-1.3-1.5H9.5l-1.3 1.5A3 3 0 0 1 3 15v-3a4 4 0 0 1 4-4z" /><path d="M8 12h3M9.5 10.5v3" /></>,
  pill: <><rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)" /><path d="m8.8 8.8 6.4 6.4" /></>,
  sparkle: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.6 1.7L21 18l-1.4.4L19 20l-.6-1.6L17 18l1.4-.3z" /></>,
  plane: <><path d="M2 12l19-7-7 19-3-8z" /></>,
  gift: <><rect x="3" y="9" width="18" height="12" rx="1" /><path d="M3 13h18M12 9v12" /><path d="M12 9C9 9 7 8 7 6a2 2 0 0 1 4 0c0 2 1 3 1 3zM12 9c3 0 5-1 5-3a2 2 0 0 0-4 0c0 2 1 3 1 3z" /></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M10 18h4" /></>,
  fuel: <><path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M7 9h6" /><path d="M14 8h3l2 3v7a2 2 0 0 1-4 0v-7" /></>,
  cat: <><path d="M4 10 5 4l4 3h6l4-3 1 6a7 7 0 1 1-16 0z" /><path d="M9 13h.01M15 13h.01M10 17h4" /></>,
  book: <><path d="M4 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4z" /><path d="M20 4h-3a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h3z" /></>,
  graduation: <><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11v5c0 2 3 3 6 3s6-1 6-3v-5M22 9v6" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5h6v2M3 12h18" /></>,
  cup: <><path d="M6 8h10v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" /><path d="M16 9h2a2 2 0 0 1 0 4h-2M6 4h10" /></>,
}

/** emoji / 旧数据字符串 → 线性图标名 */
const EMOJI_MAP: Record<string, string> = {
  '🌿': 'leaf', '🌱': 'leaf', '🧾': 'receipt', '📈': 'chart', '📊': 'chart',
  '⚙️': 'gear', '☰': 'menu', '🔍': 'search', '⚟': 'filter', '🗑': 'trash',
  '➕': 'plus', '✕': 'close', '✓': 'check', '⚠️': 'warning', '📌': 'pin',
  '🔔': 'bell', '↻': 'refresh', '›': 'chevron', '❓': 'help', '✨': 'sparkle',
  '💰': 'wallet', '💳': 'card', '💵': 'banknote', '🚗': 'car', '🏠': 'home',
  '🗂': 'folder', '📦': 'box', '🎨': 'palette', '🔒': 'lock', '💱': 'exchange',
  '☁️': 'cloud', '📥': 'inbox', '📤': 'outbox', '☀️': 'sun', '🌙': 'moon',
  '📱': 'smartphone', '🎓': 'graduation', '💼': 'briefcase',
  '🍜': 'bowl', '🍚': 'bowl', '🚌': 'bus', '🛍️': 'bag', '🎮': 'game',
  '💊': 'pill', '☕': 'coffee', '🍺': 'cup', '✈️': 'plane', '🎁': 'gift',
  '⛽': 'fuel', '🐱': 'cat', '📚': 'book', '💸': 'wallet', '💹': 'chart',
}

export function Icon({
  name,
  size = 20,
  className,
  style,
}: {
  name: string
  size?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {ICONS[name] ?? ICONS.tag}
    </svg>
  )
}

/**
 * 兼容层：接收数据里存的 emoji（或图标名），统一渲染为线性图标。
 * 老账本、导出文件、云同步数据里的 emoji 无需迁移即可正常显示。
 */
export function Glyph({
  value,
  size = 20,
  className,
  style,
}: {
  value?: string | null
  size?: number
  className?: string
  style?: CSSProperties
}) {
  const raw = (value ?? '').trim()
  const name = EMOJI_MAP[raw] ?? (raw in ICONS ? raw : 'tag')
  return <Icon name={name} size={size} className={className} style={style} />
}

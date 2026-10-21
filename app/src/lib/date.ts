export function nowLocalISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function todayDateISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function ym(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function monthLabel(ymStr: string): string {
  const [, m] = ymStr.split('-')
  return `${Number(m)}月`
}

export function monthRange(ymStr: string): { start: number; end: number } {
  const [y, m] = ymStr.split('-').map(Number)
  const start = new Date(y, m - 1, 1).getTime()
  const end = new Date(y, m, 0, 23, 59, 59, 999).getTime()
  return { start, end }
}

// 两个月份相差几个月（end - start，可为负）
export function monthDiff(startYm: string, endYm: string): number {
  const [sy, sm] = startYm.split('-').map(Number)
  const [ey, em] = endYm.split('-').map(Number)
  return (ey - sy) * 12 + (em - sm)
}

// 由时间戳区间推出覆盖的月份列表（用于摊销口径的区间汇总）
export function monthsInRange(start: number, end: number): string[] {
  const sd = new Date(start)
  const ed = new Date(end)
  return monthsBetween(ym(sd), ym(ed))
}

export function monthsBetween(startYm: string, endYm: string): string[] {
  const [sy, sm] = startYm.split('-').map(Number)
  const [ey, em] = endYm.split('-').map(Number)
  const count = (ey - sy) * 12 + (em - sm)
  if (count < 0) return []
  const arr: string[] = []
  for (let i = 0; i <= count; i++) {
    arr.push(ym(new Date(sy, sm - 1 + i, 1)))
  }
  return arr
}

export function lastNMonths(n: number, from = new Date()): string[] {
  const arr: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1)
    arr.push(ym(d))
  }
  return arr
}

export function fmtDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fmtMonthDay(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fmtTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtDateTime(iso: string): string {
  return `${fmtMonthDay(iso)} ${fmtTime(iso)}`
}

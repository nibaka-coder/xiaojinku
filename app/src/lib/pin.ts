// 注意：以下为演示用弱哈希，并非强加密，仅用于本地 PIN 锁屏体验。
// 真实生产环境应使用 Web Crypto (PBKDF2/SHA-256) + 加盐，并配合后端鉴权。
export function hashPin(pin: string): string {
  let h = 5381
  for (let i = 0; i < pin.length; i++) {
    h = ((h << 5) + h + pin.charCodeAt(i)) >>> 0
  }
  return h.toString(16)
}

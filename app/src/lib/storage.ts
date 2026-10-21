import { get, set, del } from 'idb-keyval'

// Async storage adapter compatible with zustand persist (createJSONStorage)
export const idbStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const v = await get(name)
    return v === undefined || v === null ? null : (v as string)
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value)
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name)
  },
}

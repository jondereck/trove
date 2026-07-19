import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Collection, LibraryFilter, Save } from '../types'

const STORAGE_KEY = 'trove.library-cache.v1'

export interface LibraryCacheSnapshot {
  saves: Save[]
  libraryTotal: number
  filteredTotal: number
  inboxSaves: Save[]
  collections: Collection[]
  filter: LibraryFilter
  cachedAt: string
}

let memorySnapshot: LibraryCacheSnapshot | null = null
let storage: Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'> = AsyncStorage

export function __resetForTests(mock: Map<string, string>): void {
  memorySnapshot = null
  storage = {
    getItem: async (key: string) => mock.get(key) ?? null,
    setItem: async (key: string, value: string) => { mock.set(key, value) },
    removeItem: async (key: string) => { mock.delete(key) },
  }
}

export function peekLibraryCache(): LibraryCacheSnapshot | null {
  return memorySnapshot
}

export async function loadLibraryCache(): Promise<LibraryCacheSnapshot | null> {
  if (memorySnapshot) return memorySnapshot
  try {
    const raw = await storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LibraryCacheSnapshot
    memorySnapshot = parsed
    return parsed
  } catch {
    return null
  }
}

export async function cacheLibrarySnapshot(snapshot: LibraryCacheSnapshot): Promise<void> {
  memorySnapshot = snapshot
  try {
    await storage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // non-fatal
  }
}

export async function clearLibraryCache(): Promise<void> {
  memorySnapshot = null
  try {
    await storage.removeItem(STORAGE_KEY)
  } catch {
    // non-fatal
  }
}

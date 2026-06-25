import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'
import { Save, Collection } from '../types'
import { normalizeUrl } from './url'
import { SEARCH_STOPWORDS, type Profile } from './cloudDb'

// Device-local data layer (AsyncStorage) — used when no user is signed in.
// Mirrors lib/cloudDb.ts function-for-function so lib/db.ts can route between
// them transparently. Saves carry user_id: 'local' until they're migrated to
// the cloud on sign-in (see lib/migrateLocal.ts).

const SAVES_KEY = 'trove.local.saves'
const COLLECTIONS_KEY = 'trove.local.collections'

const LOCAL_USER = 'local'

// In-memory cache, hydrated once. AsyncStorage is async, but the rest of the
// app calls these like quick reads, so we keep a cache and persist on writes.
let savesCache: Save[] | null = null
let collectionsCache: Collection[] | null = null

async function loadSaves(): Promise<Save[]> {
  if (savesCache) return savesCache
  const raw = await AsyncStorage.getItem(SAVES_KEY)
  savesCache = raw ? (JSON.parse(raw) as Save[]) : []
  return savesCache
}

async function loadCollections(): Promise<Collection[]> {
  if (collectionsCache) return collectionsCache
  const raw = await AsyncStorage.getItem(COLLECTIONS_KEY)
  collectionsCache = raw ? (JSON.parse(raw) as Collection[]) : []
  return collectionsCache
}

async function persistSaves(saves: Save[]): Promise<void> {
  savesCache = saves
  await AsyncStorage.setItem(SAVES_KEY, JSON.stringify(saves))
}

async function persistCollections(cols: Collection[]): Promise<void> {
  collectionsCache = cols
  await AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(cols))
}

const byNewest = (a: Save, b: Save) => b.created_at.localeCompare(a.created_at)

// ── Saves ─────────────────────────────────────────────────────────────────────

export async function fetchLibrarySaves(): Promise<Save[]> {
  const saves = await loadSaves()
  return saves.filter(s => !s.is_inbox).sort(byNewest)
}

export async function fetchInboxSaves(): Promise<Save[]> {
  const saves = await loadSaves()
  return saves.filter(s => s.is_inbox).sort(byNewest)
}

export async function fetchSave(id: string): Promise<Save | null> {
  const saves = await loadSaves()
  return saves.find(s => s.id === id) ?? null
}

export const fetchSaveById = fetchSave

export async function fetchCollectionSaves(collectionId: string): Promise<Save[]> {
  const saves = await loadSaves()
  return saves.filter(s => s.collection_id === collectionId).sort(byNewest)
}

export const fetchSavesByCollection = fetchCollectionSaves

export async function searchSaves(query: string): Promise<Save[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const words = trimmed
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !SEARCH_STOPWORDS.has(w))

  const terms = words.length ? words : [trimmed.toLowerCase()]
  const saves = await loadSaves()

  const matches = saves.filter(s => {
    const haystack = [s.title, s.description, s.content].filter(Boolean).join(' ').toLowerCase()
    const tags = (s.tags ?? []).map(t => t.toLowerCase())
    return terms.some(w => haystack.includes(w) || tags.includes(w))
  })
  return matches.sort(byNewest).slice(0, 50)
}

export async function fetchSearchSuggestions(): Promise<string[]> {
  const [saves, cols] = await Promise.all([loadSaves(), loadCollections()])

  const freq: Record<string, number> = {}
  saves.forEach(s => s.tags?.forEach(t => { freq[t] = (freq[t] ?? 0) + 1 }))
  const topTags = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([t]) => t)

  const out = topTags.map(t => `my ${t} saves`)
  const firstCol = [...cols].sort((a, b) => a.name.localeCompare(b.name))[0]?.name
  if (firstCol) out.push(`everything in ${firstCol}`)
  return out.slice(0, 3)
}

export async function findSaveByUrl(url: string): Promise<Save | null> {
  const saves = await loadSaves()
  const target = normalizeUrl(url)
  return saves.find(s => s.url === target) ?? null
}

export async function createSave(input: {
  url?: string
  title: string
  description?: string
  type: Save['type']
  content?: string
  image_url?: string
  collection_id?: string
  tags?: string[]
  is_inbox?: boolean
}): Promise<Save | null> {
  const url = input.url ? normalizeUrl(input.url) : undefined
  if (url) {
    const existing = await findSaveByUrl(url)
    if (existing) return existing
  }
  const saves = await loadSaves()
  const save: Save = {
    id: Crypto.randomUUID(),
    user_id: LOCAL_USER,
    url,
    title: input.title,
    description: input.description,
    type: input.type,
    content: input.content,
    image_url: input.image_url,
    collection_id: input.collection_id,
    tags: input.tags ?? [],
    is_inbox: input.is_inbox ?? true,
    created_at: new Date().toISOString(),
  }
  await persistSaves([save, ...saves])
  return save
}

export async function updateSave(
  id: string,
  updates: Partial<Omit<Save, 'id' | 'user_id' | 'created_at'>>
): Promise<boolean> {
  const saves = await loadSaves()
  const idx = saves.findIndex(s => s.id === id)
  if (idx === -1) return false
  const next = [...saves]
  next[idx] = { ...next[idx], ...updates }
  await persistSaves(next)
  return true
}

export async function deleteSave(id: string): Promise<boolean> {
  const saves = await loadSaves()
  await persistSaves(saves.filter(s => s.id !== id))
  return true
}

// ── Collections ───────────────────────────────────────────────────────────────

export async function fetchCollections(): Promise<Collection[]> {
  const [cols, saves] = await Promise.all([loadCollections(), loadSaves()])
  if (!cols.length) return []

  const countMap: Record<string, number> = {}
  const coverMap: Record<string, string[]> = {}
  ;[...saves].sort(byNewest).forEach(s => {
    if (!s.collection_id) return
    countMap[s.collection_id] = (countMap[s.collection_id] ?? 0) + 1
    if (s.image_url) {
      const arr = coverMap[s.collection_id] ?? (coverMap[s.collection_id] = [])
      if (arr.length < 3) arr.push(s.image_url)
    }
  })

  return [...cols]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(c => ({ ...c, save_count: countMap[c.id] ?? 0, cover_urls: coverMap[c.id] ?? [] }))
}

export async function fetchCollection(id: string): Promise<Collection | null> {
  const cols = await loadCollections()
  return cols.find(c => c.id === id) ?? null
}

export const fetchCollectionById = fetchCollection

export async function createCollection(input: {
  name: string
  icon?: string
  color?: string
  description?: string
}): Promise<Collection | null> {
  const cols = await loadCollections()
  const col: Collection = {
    id: Crypto.randomUUID(),
    user_id: LOCAL_USER,
    name: input.name,
    icon: input.icon ?? 'folder-outline',
    color: input.color ?? '#c0613c',
    description: input.description,
    created_at: new Date().toISOString(),
  }
  await persistCollections([...cols, col])
  return col
}

export async function updateCollection(
  id: string,
  updates: Partial<Pick<Collection, 'name' | 'icon' | 'color' | 'description'>>
): Promise<boolean> {
  const cols = await loadCollections()
  const idx = cols.findIndex(c => c.id === id)
  if (idx === -1) return false
  const next = [...cols]
  next[idx] = { ...next[idx], ...updates }
  await persistCollections(next)
  return true
}

// Mirrors the cloud `on delete set null`: orphaned saves fall back to uncategorized.
export async function deleteCollection(id: string): Promise<boolean> {
  const [cols, saves] = await Promise.all([loadCollections(), loadSaves()])
  await persistCollections(cols.filter(c => c.id !== id))
  const touched = saves.map(s => (s.collection_id === id ? { ...s, collection_id: undefined } : s))
  await persistSaves(touched)
  return true
}

export async function upsertCollectionByName(name: string): Promise<string | null> {
  const cols = await loadCollections()
  const existing = cols.find(c => c.name.toLowerCase() === name.toLowerCase())
  if (existing) return existing.id
  const created = await createCollection({ name })
  return created?.id ?? null
}

// ── Profile ───────────────────────────────────────────────────────────────────
// No local profile — the account/profile UI is guarded behind isLoggedIn().

export async function fetchProfile(): Promise<Profile | null> {
  return null
}

export async function updateProfile(
  _updates: Partial<Pick<Profile, 'first_name' | 'last_name' | 'avatar_url'>>
): Promise<boolean> {
  return false
}

export async function fetchCounts(): Promise<{ saves: number; collections: number }> {
  const [saves, cols] = await Promise.all([loadSaves(), loadCollections()])
  return { saves: saves.length, collections: cols.length }
}

// ── Bulk helpers (migration + import/export) ────────────────────────────────────

export async function loadLocalData(): Promise<{ saves: Save[]; collections: Collection[] }> {
  const [saves, collections] = await Promise.all([loadSaves(), loadCollections()])
  return { saves, collections }
}

export async function hasLocalData(): Promise<boolean> {
  const { saves, collections } = await loadLocalData()
  return saves.length > 0 || collections.length > 0
}

export async function clearLocalData(): Promise<void> {
  savesCache = []
  collectionsCache = []
  await AsyncStorage.multiRemove([SAVES_KEY, COLLECTIONS_KEY])
}

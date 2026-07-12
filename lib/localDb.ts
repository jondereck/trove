import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'
import { Save, Collection, LibraryFilter, LibraryPageOptions, LibraryPageResult } from '../types'
import { normalizeUrl } from './url'
import { tokenizeSearchQuery, type Profile } from './cloudDb'

// Device-local data layer (AsyncStorage) — used when no user is signed in.
// Mirrors lib/cloudDb.ts function-for-function so lib/db.ts can route between
// them transparently. Saves carry user_id: 'local' until they're migrated to
// the cloud on sign-in (see lib/migrateLocal.ts).

const SAVES_KEY = 'trove.local.saves'
const COLLECTIONS_KEY = 'trove.local.collections'
const PROFILE_KEY = 'trove.local.profile'

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

const byPinnedThenNewest = (a: Save, b: Save) => {
  const pinDiff = Number(!!b.is_pinned) - Number(!!a.is_pinned)
  return pinDiff !== 0 ? pinDiff : byNewest(a, b)
}

const byPinnedThenName = (a: Collection, b: Collection) => {
  const pinDiff = Number(!!b.is_pinned) - Number(!!a.is_pinned)
  return pinDiff !== 0 ? pinDiff : a.name.localeCompare(b.name)
}

function filterLibrarySaves(saves: Save[], filter: LibraryFilter): Save[] {
  const library = saves.filter(s => !s.is_inbox)
  if (filter === 'all') return library.sort(byPinnedThenNewest)
  if (filter === 'unread') return library.filter(s => s.is_viewed === false).sort(byPinnedThenNewest)
  if (filter === 'fav') return library.filter(s => s.is_favorite).sort(byPinnedThenNewest)
  return library.filter(s => s.type === filter).sort(byPinnedThenNewest)
}

// ── Saves ─────────────────────────────────────────────────────────────────────

export async function fetchLibrarySaves(): Promise<Save[]> {
  const saves = await loadSaves()
  return filterLibrarySaves(saves, 'all')
}

export async function fetchLibrarySavesPage({
  limit,
  offset,
  filter,
}: LibraryPageOptions): Promise<LibraryPageResult> {
  const filtered = filterLibrarySaves(await loadSaves(), filter)
  return {
    saves: filtered.slice(offset, offset + limit),
    total: filtered.length,
  }
}

export async function fetchLibraryCount(): Promise<number> {
  const saves = await loadSaves()
  return saves.filter(s => !s.is_inbox).length
}

export async function fetchInboxSaves(): Promise<Save[]> {
  const saves = await loadSaves()
  return saves.filter(s => s.is_inbox).sort(byNewest)
}

export async function fetchInboxUnreadCount(): Promise<number> {
  const saves = await loadSaves()
  return saves.filter(s => s.is_inbox && s.is_viewed === false).length
}

export async function fetchSave(id: string): Promise<Save | null> {
  const saves = await loadSaves()
  return saves.find(s => s.id === id) ?? null
}

export const fetchSaveById = fetchSave

export async function fetchCollectionSaves(collectionId: string): Promise<Save[]> {
  const saves = await loadSaves()
  return saves.filter(s => s.collection_id === collectionId).sort(byPinnedThenNewest)
}

export const fetchSavesByCollection = fetchCollectionSaves

// Mirrors the cloud search_saves RPC: every term must match at least one
// field; results ranked title 4 > tags 3 > description/content 2 > url 1
// per matching term, ties broken by newest first.
export async function searchSaves(query: string): Promise<Save[]> {
  const terms = tokenizeSearchQuery(query)
  if (!terms.length) return []

  const saves = await loadSaves()

  const scored: { save: Save; score: number }[] = []
  for (const s of saves) {
    const title = s.title.toLowerCase()
    const description = (s.description ?? '').toLowerCase()
    const content = (s.content ?? '').toLowerCase()
    const url = (s.url ?? '').toLowerCase()
    const tags = (s.tags ?? []).join(' ').toLowerCase()

    let score = 0
    let allMatch = true
    for (const w of terms) {
      let termScore = 0
      if (title.includes(w)) termScore += 4
      if (tags.includes(w)) termScore += 3
      if (description.includes(w)) termScore += 2
      if (content.includes(w)) termScore += 2
      if (url.includes(w)) termScore += 1
      if (termScore === 0) { allMatch = false; break }
      score += termScore
    }
    if (allMatch) scored.push({ save: s, score })
  }

  return scored
    .sort((a, b) => b.score - a.score || byNewest(a.save, b.save))
    .slice(0, 50)
    .map(x => x.save)
}

export async function searchCollections(query: string): Promise<Collection[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const cols = await loadCollections()
  return cols
    .filter(c => c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 10)
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
  is_favorite?: boolean
  is_pinned?: boolean
  is_viewed?: boolean
  created_at?: string
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
    is_favorite: input.is_favorite ?? false,
    is_pinned: input.is_pinned ?? false,
    is_viewed: input.is_viewed ?? false,
    created_at: input.created_at ?? new Date().toISOString(),
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
    .sort(byPinnedThenName)
    .map(c => {
      const recent = coverMap[c.id] ?? []
      const custom = c.cover_image_url
      const cover_urls = custom
        ? [custom, ...recent.filter(u => u !== custom)].slice(0, 3)
        : recent
      return { ...c, save_count: countMap[c.id] ?? 0, cover_urls }
    })
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
  cover_image_url?: string | null
  created_at?: string
}): Promise<Collection | null> {
  const cols = await loadCollections()
  const col: Collection = {
    id: Crypto.randomUUID(),
    user_id: LOCAL_USER,
    name: input.name,
    icon: input.icon ?? 'folder-outline',
    color: input.color ?? '#c0613c',
    description: input.description,
    cover_image_url: input.cover_image_url ?? null,
    created_at: input.created_at ?? new Date().toISOString(),
  }
  await persistCollections([...cols, col])
  return col
}

export async function updateCollection(
  id: string,
  updates: Partial<Pick<Collection, 'name' | 'icon' | 'color' | 'description' | 'cover_image_url' | 'is_pinned'>>
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
// Guest display name + avatar live on-device until the user signs in.

export async function fetchProfile(): Promise<Profile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY)
    const parsed = raw ? JSON.parse(raw) as Partial<Profile> : {}
    return {
      id: LOCAL_USER,
      first_name: parsed.first_name ?? null,
      last_name: parsed.last_name ?? null,
      avatar_url: parsed.avatar_url ?? null,
    }
  } catch {
    return { id: LOCAL_USER, first_name: null, last_name: null, avatar_url: null }
  }
}

export async function updateProfile(
  updates: Partial<Pick<Profile, 'first_name' | 'last_name' | 'avatar_url'>>
): Promise<boolean> {
  try {
    const current = await fetchProfile()
    if (!current) return false
    const next = { ...current, ...updates }
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify({
      first_name: next.first_name,
      last_name: next.last_name,
      avatar_url: next.avatar_url,
    }))
    return true
  } catch {
    return false
  }
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

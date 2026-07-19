import { supabase } from './supabase'
import { Save, Collection, LibraryFilter, LibraryPageOptions, LibraryPageResult } from '../types'
import { getUserId } from './session'
import { normalizeUrl } from './url'
import {
  bindExpectedUserId,
  dbErrorSummary,
  isMissingViewedColumn,
  stripMissingOptionalColumn,
} from './cloudDbColumns'
import { rankSavesByTerms } from './searchMatch'

// Pin columns (`is_pinned`) are optional until supabase/add-pinned.sql is run.
// Probed once per session; queries fall back to created_at/name ordering.

let pinColumnsAvailable: boolean | null = null
let viewedColumnAvailable: boolean | null = null

const byNewest = (a: Save, b: Save) => b.created_at.localeCompare(a.created_at)

const byPinnedThenNewest = (a: Save, b: Save) => {
  const pinDiff = Number(!!b.is_pinned) - Number(!!a.is_pinned)
  return pinDiff !== 0 ? pinDiff : byNewest(a, b)
}

const byPinnedThenName = (a: Collection, b: Collection) => {
  const pinDiff = Number(!!b.is_pinned) - Number(!!a.is_pinned)
  return pinDiff !== 0 ? pinDiff : a.name.localeCompare(b.name)
}

function missingPinColumn(err: { message?: string } | null): boolean {
  return !!err?.message?.includes('is_pinned')
}

async function hasPinColumns(): Promise<boolean> {
  if (pinColumnsAvailable !== null) return pinColumnsAvailable
  const { error } = await supabase.from('collections').select('is_pinned').limit(1)
  pinColumnsAvailable = !error
  return pinColumnsAvailable
}

async function hasViewedColumn(): Promise<boolean> {
  if (viewedColumnAvailable !== null) return viewedColumnAvailable
  const { error } = await supabase.from('saves').select('is_viewed').limit(1)
  if (!error) {
    viewedColumnAvailable = true
    return true
  }
  if (isMissingViewedColumn(error)) {
    viewedColumnAvailable = false
    return false
  }
  console.error('hasViewedColumn:', dbErrorSummary(error))
  return false
}

function omitPin<T extends { is_pinned?: boolean }>(updates: T): Omit<T, 'is_pinned'> {
  const { is_pinned: _, ...rest } = updates
  return rest
}

async function pinSafeUpdates<T extends { is_pinned?: boolean }>(
  updates: T,
): Promise<T | Omit<T, 'is_pinned'>> {
  if (!('is_pinned' in updates) || updates.is_pinned === undefined) return updates
  if (await hasPinColumns()) return updates
  return omitPin(updates)
}

// Supabase-backed data layer — used when the user is signed in.
// Mirrored by lib/localDb.ts for the logged-out (local-only) case.
// lib/db.ts routes between the two.

// ── Saves ─────────────────────────────────────────────────────────────────────

function applyLibraryFilter<T extends { eq: (col: string, val: unknown) => T }>(
  query: T,
  filter: LibraryFilter,
  viewedOk: boolean,
): T {
  let q = query.eq('is_inbox', false)
  if (filter === 'unread') return viewedOk ? q.eq('is_viewed', false) : q
  if (filter === 'fav') return q.eq('is_favorite', true)
  if (filter !== 'all') return q.eq('type', filter)
  return q
}

export async function fetchLibrarySaves(): Promise<Save[]> {
  const { data, error } = await supabase
    .from('saves')
    .select('*')
    .eq('is_inbox', false)
    .order('created_at', { ascending: false })
  if (error) { console.error('fetchLibrarySaves:', error.message); return [] }
  return (data ?? []) as Save[]
}

export async function fetchLibrarySavesPage({
  limit,
  offset,
  filter,
}: LibraryPageOptions): Promise<LibraryPageResult> {
  const [pinOk, viewedOk] = await Promise.all([
    hasPinColumns(),
    filter === 'unread' ? hasViewedColumn() : Promise.resolve(true),
  ])
  let query = supabase.from('saves').select('*', { count: 'exact' })
  if (pinOk) query = query.order('is_pinned', { ascending: false })
  query = query.order('created_at', { ascending: false })
  query = applyLibraryFilter(query, filter, viewedOk)

  let { data, error, count } = await query.range(offset, offset + limit - 1)
  if (error && missingPinColumn(error)) {
    pinColumnsAvailable = false
    query = supabase
      .from('saves')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
    query = applyLibraryFilter(query, filter, viewedOk)
    ;({ data, error, count } = await query.range(offset, offset + limit - 1))
  }
  if (error) {
    console.error('fetchLibrarySavesPage:', error.message)
    return { saves: [], total: 0 }
  }
  return { saves: [...(data ?? []) as Save[]].sort(byPinnedThenNewest), total: count ?? 0 }
}

export async function fetchLibraryCount(): Promise<number> {
  const { count, error } = await supabase
    .from('saves')
    .select('*', { count: 'exact', head: true })
    .eq('is_inbox', false)
  if (error) { console.error('fetchLibraryCount:', error.message); return 0 }
  return count ?? 0
}

export async function fetchInboxSaves(): Promise<Save[]> {
  const { data, error } = await supabase
    .from('saves')
    .select('*')
    .eq('is_inbox', true)
    .order('created_at', { ascending: false })
  if (error) { console.error('fetchInboxSaves:', error.message); return [] }
  return (data ?? []) as Save[]
}

export async function fetchInboxUnreadCount(): Promise<number> {
  if (!(await hasViewedColumn())) return 0
  const { count, error } = await supabase
    .from('saves')
    .select('*', { count: 'exact', head: true })
    .eq('is_inbox', true)
    .eq('is_viewed', false)
  if (error) {
    if (isMissingViewedColumn(error)) {
      viewedColumnAvailable = false
      return 0
    }
    console.error('fetchInboxUnreadCount:', dbErrorSummary(error))
    return 0
  }
  return count ?? 0
}

export async function fetchUnreadLibraryCount(): Promise<number> {
  if (!(await hasViewedColumn())) return 0
  const { count, error } = await supabase
    .from('saves')
    .select('*', { count: 'exact', head: true })
    .eq('is_viewed', false)
  if (error) {
    if (isMissingViewedColumn(error)) {
      viewedColumnAvailable = false
      return 0
    }
    console.error('fetchUnreadLibraryCount:', dbErrorSummary(error))
    return 0
  }
  return count ?? 0
}

export async function fetchSave(id: string): Promise<Save | null> {
  const { data, error } = await supabase
    .from('saves')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) { console.error('fetchSave:', error.message); return null }
  return data as Save | null
}

export async function fetchCollectionSaves(collectionId: string): Promise<Save[]> {
  const pinOk = await hasPinColumns()
  let query = supabase.from('saves').select('*').eq('collection_id', collectionId)
  if (pinOk) query = query.order('is_pinned', { ascending: false })
  query = query.order('created_at', { ascending: false })

  let { data, error } = await query
  if (error && missingPinColumn(error)) {
    pinColumnsAvailable = false
    ;({ data, error } = await supabase
      .from('saves')
      .select('*')
      .eq('collection_id', collectionId)
      .order('created_at', { ascending: false }))
  }
  if (error) { console.error('fetchCollectionSaves:', error.message); return [] }
  return [...(data ?? []) as Save[]].sort(byPinnedThenNewest)
}

export function tokenizeSearchQuery(query: string): string[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  const words = trimmed
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !SEARCH_STOPWORDS.has(w))
  return words.length ? words : [trimmed.toLowerCase()]
}

// PostgREST .or() filter strings break on commas/parens/percent in user input.
const sanitizeFilterTerm = (w: string) => w.replace(/[,()%\\{}]/g, '')

export async function searchSaves(query: string): Promise<Save[]> {
  const terms = tokenizeSearchQuery(query)
  if (!terms.length) return []

  // Prefer the ranked RPC when available (full library, server-side).
  const { data, error } = await supabase.rpc('search_saves', { terms })
  if (!error) {
    const ranked = rankSavesByTerms((data ?? []) as Save[], terms)
    // Non-empty RPC results are trusted. Empty may mean an older/incomplete
    // RPC missed partial tag matches (hair → haircut) — fall through.
    if (ranked.length > 0) return ranked
  }

  // Broad client-side fallback: fetch recent saves and match with partial,
  // case-insensitive tag/title rules. Covers missing RPC and exact-only
  // PostgREST tag filters (tags.cs) that miss "hair" vs "haircut".
  const { data: rows, error: fbError } = await supabase
    .from('saves')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  if (fbError) { console.error('searchSaves:', fbError.message); return [] }
  return rankSavesByTerms((rows ?? []) as Save[], terms)
}

export async function searchCollections(query: string): Promise<Collection[]> {
  const q = sanitizeFilterTerm(query.trim().toLowerCase())
  if (!q) return []
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
    .order('name')
    .limit(10)
  if (error) { console.error('searchCollections:', error.message); return [] }
  return (data ?? []) as Collection[]
}

// Builds "Try asking" suggestions from the user's own data: their most-used
// tags plus a collection name. Returns [] when there's nothing to suggest yet.
export async function fetchSearchSuggestions(): Promise<string[]> {
  const [saveRes, colRes] = await Promise.all([
    supabase.from('saves').select('tags').limit(200),
    supabase.from('collections').select('name').order('name').limit(10),
  ])

  const freq: Record<string, number> = {}
  saveRes.data?.forEach(r => {
    ;(r.tags as string[] | null)?.forEach(t => { freq[t] = (freq[t] ?? 0) + 1 })
  })
  const topTags = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([t]) => t)

  const out = topTags.map(t => `my ${t} saves`)
  const firstCol = colRes.data?.[0]?.name
  if (firstCol) out.push(`everything in ${firstCol}`)
  return out.slice(0, 3)
}

// Returns an existing save with the same (normalized) URL for the current
// user, or null. New saves are stored normalized, so a plain match catches
// links that differ only by tracking params, `www.`, or a trailing slash.
export async function findSaveByUrl(
  url: string,
  expectedUserId?: string,
): Promise<Save | null> {
  let userId = expectedUserId ?? getUserId()
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null
  }
  if (!userId) return null
  const { data } = await supabase
    .from('saves')
    .select('*')
    .eq('user_id', userId)
    .eq('url', normalizeUrl(url))
    .limit(1)
    .maybeSingle()
  return (data as Save) ?? null
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
}, expectedUserId?: string): Promise<Save | null> {
  // Prefer the sync session cache; fall back to getUser() for a fresh token.
  let userId = expectedUserId ?? getUserId()
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null
  }
  if (!userId) return null
  // Store the canonical URL and skip inserting a near-duplicate.
  const url = input.url ? normalizeUrl(input.url) : undefined
  if (url) {
    const existing = await findSaveByUrl(url, userId)
    if (existing) return existing
  }
  const row = bindExpectedUserId({
    ...input,
    url,
    tags: input.tags ?? [],
    is_inbox: input.is_inbox ?? true,
    is_viewed: input.is_viewed ?? false,
  }, userId)
  let payload: Record<string, unknown> = { ...row }
  let { data, error } = await supabase.from('saves').insert(payload).select().single()
  for (let retry = 0; error && retry < 2; retry++) {
    const nextPayload = stripMissingOptionalColumn(payload, error)
    if (!nextPayload) break
    if ('is_viewed' in payload && !('is_viewed' in nextPayload)) {
      viewedColumnAvailable = false
    }
    if ('is_pinned' in payload && !('is_pinned' in nextPayload)) {
      pinColumnsAvailable = false
    }
    payload = nextPayload
    ;({ data, error } = await supabase.from('saves').insert(payload).select().single())
  }
  if (error) {
    if (expectedUserId) throw new Error(`createSave: ${error.message}`)
    console.error('createSave:', error.message)
    return null
  }
  return data as Save
}

export async function updateSave(id: string, updates: Partial<Omit<Save, 'id' | 'user_id' | 'created_at'>>): Promise<boolean> {
  let payload = await pinSafeUpdates(updates)
  if (Object.keys(payload).length === 0) return false

  let { error } = await supabase.from('saves').update(payload).eq('id', id)
  if (error && missingPinColumn(error) && 'is_pinned' in updates) {
    pinColumnsAvailable = false
    payload = omitPin(updates)
    if (Object.keys(payload).length === 0) return false
    ;({ error } = await supabase.from('saves').update(payload).eq('id', id))
  }
  if (error) { console.error('updateSave:', error.message); return false }
  return true
}

export async function deleteSave(id: string): Promise<boolean> {
  const { error } = await supabase.from('saves').delete().eq('id', id)
  if (error) { console.error('deleteSave:', error.message); return false }
  return true
}

// ── Collections ───────────────────────────────────────────────────────────────

export async function fetchCollections(expectedUserId?: string): Promise<Collection[]> {
  const pinOk = await hasPinColumns()
  let query = supabase.from('collections').select('*')
  if (expectedUserId) query = query.eq('user_id', expectedUserId)
  if (pinOk) query = query.order('is_pinned', { ascending: false })
  query = query.order('name')

  let { data: cols, error } = await query
  if (error && missingPinColumn(error)) {
    pinColumnsAvailable = false
    let fallback = supabase.from('collections').select('*')
    if (expectedUserId) fallback = fallback.eq('user_id', expectedUserId)
    ;({ data: cols, error } = await fallback.order('name'))
  }
  if (error) {
    if (expectedUserId) throw new Error(`fetchCollections: ${error.message}`)
    console.error('fetchCollections:', error.message)
    return []
  }
  if (!cols?.length) return []

  // One query gives both counts and recent cover images, merged client-side.
  let savesQuery = supabase
    .from('saves')
    .select('collection_id, image_url, created_at')
    .not('collection_id', 'is', null)
    .order('created_at', { ascending: false })
  if (expectedUserId) savesQuery = savesQuery.eq('user_id', expectedUserId)
  const { data: rows, error: rowsError } = await savesQuery
  if (rowsError && expectedUserId) {
    throw new Error(`fetchCollections: ${rowsError.message}`)
  }

  const countMap: Record<string, number> = {}
  const coverMap: Record<string, string[]> = {}
  rows?.forEach(s => {
    if (!s.collection_id) return
    countMap[s.collection_id] = (countMap[s.collection_id] ?? 0) + 1
    if (s.image_url) {
      const arr = coverMap[s.collection_id] ?? (coverMap[s.collection_id] = [])
      if (arr.length < 3) arr.push(s.image_url)
    }
  })

  return [...cols.map(c => {
    const recent = coverMap[c.id] ?? []
    const custom = c.cover_image_url
    const cover_urls = custom
      ? [custom, ...recent.filter(u => u !== custom)].slice(0, 3)
      : recent
    return {
      ...c,
      save_count: countMap[c.id] ?? 0,
      cover_urls,
    }
  }) as Collection[]].sort(byPinnedThenName)
}

export async function fetchCollection(id: string): Promise<Collection | null> {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) { console.error('fetchCollection:', error.message); return null }
  return data as Collection | null
}

export async function createCollection(input: {
  name: string
  icon?: string
  color?: string
  description?: string
  cover_image_url?: string | null
  is_pinned?: boolean
  created_at?: string
}, expectedUserId?: string): Promise<Collection | null> {
  const userId = expectedUserId ?? (await supabase.auth.getUser()).data.user?.id
  if (!userId) return null
  const row = bindExpectedUserId({
    ...input,
    icon: input.icon ?? 'folder-outline',
    color: input.color ?? '#c0613c',
  }, userId)
  let { data, error } = await supabase.from('collections').insert(row).select().single()
  if (error && missingPinColumn(error) && 'is_pinned' in input) {
    pinColumnsAvailable = false
    const { is_pinned: _, ...withoutPin } = row
    ;({ data, error } = await supabase.from('collections').insert(withoutPin).select().single())
  }
  if (error) {
    if (expectedUserId) throw new Error(`createCollection: ${error.message}`)
    console.error('createCollection:', error.message)
    return null
  }
  return data as Collection
}

export async function updateCollection(
  id: string,
  updates: Partial<Pick<Collection, 'name' | 'icon' | 'color' | 'description' | 'cover_image_url' | 'is_pinned'>>
): Promise<boolean> {
  let payload = await pinSafeUpdates(updates)
  if (Object.keys(payload).length === 0) return false

  let { error } = await supabase.from('collections').update(payload).eq('id', id)
  if (error && missingPinColumn(error) && 'is_pinned' in updates) {
    pinColumnsAvailable = false
    payload = omitPin(updates)
    if (Object.keys(payload).length === 0) return false
    ;({ error } = await supabase.from('collections').update(payload).eq('id', id))
  }
  if (error) { console.error('updateCollection:', error.message); return false }
  return true
}

// Saves keep `on delete set null`, so their saves fall back to uncategorized.
export async function deleteCollection(id: string): Promise<boolean> {
  const { error } = await supabase.from('collections').delete().eq('id', id)
  if (error) { console.error('deleteCollection:', error.message); return false }
  return true
}

// Used by AI Organize: upserts a collection by name (finds existing or creates new)
export async function upsertCollectionByName(name: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('collections')
    .select('id')
    .ilike('name', name)
    .maybeSingle()
  if (existing) return existing.id
  const created = await createCollection({ name })
  return created?.id ?? null
}

export async function fetchSaveById(id: string): Promise<Save | null> {
  const { data, error } = await supabase.from('saves').select('*').eq('id', id).single()
  if (error) { console.error('fetchSaveById:', error.message); return null }
  return data as Save
}

export async function fetchCollectionById(id: string): Promise<Collection | null> {
  const { data, error } = await supabase.from('collections').select('*').eq('id', id).single()
  if (error) { console.error('fetchCollectionById:', error.message); return null }
  return data as Collection
}

export async function fetchSavesByCollection(collectionId: string): Promise<Save[]> {
  const { data, error } = await supabase
    .from('saves')
    .select('*')
    .eq('collection_id', collectionId)
    .order('created_at', { ascending: false })
  if (error) { console.error('fetchSavesByCollection:', error.message); return [] }
  return (data ?? []) as Save[]
}

// ── Profile ───────────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
}

export async function fetchProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle()
  if (error) { console.error('fetchProfile:', error.message); return null }
  return data as Profile | null
}

export async function updateProfile(
  updates: Partial<Pick<Profile, 'first_name' | 'last_name' | 'avatar_url'>>
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  // Upsert so older accounts without a profiles row still save on first edit.
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, ...updates }, { onConflict: 'id' })
  if (error) { console.error('updateProfile:', error.message); return false }
  return true
}

// Lightweight head counts for the Account stats row.
export async function fetchCounts(expectedUserId?: string): Promise<{
  saves: number
  collections: number
}> {
  let savesQuery = supabase.from('saves').select('*', { count: 'exact', head: true })
  let collectionsQuery = supabase
    .from('collections')
    .select('*', { count: 'exact', head: true })
  if (expectedUserId) {
    savesQuery = savesQuery.eq('user_id', expectedUserId)
    collectionsQuery = collectionsQuery.eq('user_id', expectedUserId)
  }
  const [s, c] = await Promise.all([
    savesQuery,
    collectionsQuery,
  ])
  if (expectedUserId && (s.error || c.error)) {
    throw new Error(`fetchCounts: ${(s.error ?? c.error)!.message}`)
  }
  return { saves: s.count ?? 0, collections: c.count ?? 0 }
}

// Shared search tokenizer — used by both the cloud `.or()` query and the
// local in-memory filter so plain-words queries behave identically.
export const SEARCH_STOPWORDS = new Set([
  'the', 'that', 'this', 'from', 'last', 'ideas', 'idea', 'saved', 'save', 'my',
  'everything', 'all', 'in', 'me', 'and', 'for', 'with', 'about', 'show',
])

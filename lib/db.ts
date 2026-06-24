import { supabase } from './supabase'
import { Save, Collection } from '../types'
import { normalizeUrl } from './url'

// ── Saves ─────────────────────────────────────────────────────────────────────

export async function fetchLibrarySaves(): Promise<Save[]> {
  const { data, error } = await supabase
    .from('saves')
    .select('*')
    .eq('is_inbox', false)
    .order('created_at', { ascending: false })
  if (error) { console.error('fetchLibrarySaves:', error.message); return [] }
  return (data ?? []) as Save[]
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
  const { data, error } = await supabase
    .from('saves')
    .select('*')
    .eq('collection_id', collectionId)
    .order('created_at', { ascending: false })
  if (error) { console.error('fetchCollectionSaves:', error.message); return [] }
  return (data ?? []) as Save[]
}

const SEARCH_STOPWORDS = new Set([
  'the', 'that', 'this', 'from', 'last', 'ideas', 'idea', 'saved', 'save', 'my',
  'everything', 'all', 'in', 'me', 'and', 'for', 'with', 'about', 'show',
])

// Splits a natural-language query into meaningful words and matches saves where
// ANY word appears in the title, description, content, or tags — so plain-words
// queries like "my design saves" still surface tagged items.
export async function searchSaves(query: string): Promise<Save[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const words = trimmed
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !SEARCH_STOPWORDS.has(w))

  const terms = words.length ? words : [trimmed.toLowerCase()]
  const conditions = terms
    .flatMap(w => [
      `title.ilike.%${w}%`,
      `description.ilike.%${w}%`,
      `content.ilike.%${w}%`,
      `tags.cs.{${w}}`,
    ])
    .join(',')

  const { data, error } = await supabase
    .from('saves')
    .select('*')
    .or(conditions)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) { console.error('searchSaves:', error.message); return [] }
  return (data ?? []) as Save[]
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
export async function findSaveByUrl(url: string): Promise<Save | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('saves')
    .select('*')
    .eq('user_id', user.id)
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
}): Promise<Save | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // Store the canonical URL and skip inserting a near-duplicate.
  const url = input.url ? normalizeUrl(input.url) : undefined
  if (url) {
    const existing = await findSaveByUrl(url)
    if (existing) return existing
  }
  const { data, error } = await supabase
    .from('saves')
    .insert({ ...input, url, user_id: user.id, tags: input.tags ?? [], is_inbox: input.is_inbox ?? true })
    .select()
    .single()
  if (error) { console.error('createSave:', error.message); return null }
  return data as Save
}

export async function updateSave(id: string, updates: Partial<Omit<Save, 'id' | 'user_id' | 'created_at'>>): Promise<boolean> {
  const { error } = await supabase.from('saves').update(updates).eq('id', id)
  if (error) { console.error('updateSave:', error.message); return false }
  return true
}

export async function deleteSave(id: string): Promise<boolean> {
  const { error } = await supabase.from('saves').delete().eq('id', id)
  if (error) { console.error('deleteSave:', error.message); return false }
  return true
}

// ── Collections ───────────────────────────────────────────────────────────────

export async function fetchCollections(): Promise<Collection[]> {
  const { data: cols, error } = await supabase
    .from('collections')
    .select('*')
    .order('name')
  if (error) { console.error('fetchCollections:', error.message); return [] }
  if (!cols?.length) return []

  // One query gives both counts and recent cover images, merged client-side.
  const { data: rows } = await supabase
    .from('saves')
    .select('collection_id, image_url, created_at')
    .not('collection_id', 'is', null)
    .order('created_at', { ascending: false })

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

  return cols.map(c => ({
    ...c,
    save_count: countMap[c.id] ?? 0,
    cover_urls: coverMap[c.id] ?? [],
  })) as Collection[]
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
  emoji?: string
  color?: string
  description?: string
}): Promise<Collection | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('collections')
    .insert({ ...input, user_id: user.id, emoji: input.emoji ?? '📁', color: input.color ?? '#c0613c' })
    .select()
    .single()
  if (error) { console.error('createCollection:', error.message); return null }
  return data as Collection
}

export async function updateCollection(
  id: string,
  updates: Partial<Pick<Collection, 'name' | 'emoji' | 'color' | 'description'>>
): Promise<boolean> {
  const { error } = await supabase.from('collections').update(updates).eq('id', id)
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
  avatar_url: string | null
}

export async function fetchProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle()
  if (error) { console.error('fetchProfile:', error.message); return null }
  return data as Profile | null
}

export async function updateProfile(
  updates: Partial<Pick<Profile, 'first_name' | 'avatar_url'>>
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
  if (error) { console.error('updateProfile:', error.message); return false }
  return true
}

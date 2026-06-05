import { supabase } from './supabase'
import { Save, Collection } from '../types'

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

export async function searchSaves(query: string): Promise<Save[]> {
  if (!query.trim()) return []
  const q = `%${query.trim()}%`
  const { data, error } = await supabase
    .from('saves')
    .select('*')
    .or(`title.ilike.${q},description.ilike.${q},content.ilike.${q}`)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) { console.error('searchSaves:', error.message); return [] }
  return (data ?? []) as Save[]
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
  const { data, error } = await supabase
    .from('saves')
    .insert({ ...input, user_id: user.id, tags: input.tags ?? [], is_inbox: input.is_inbox ?? true })
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

  // Fetch save counts in a single query, then merge client-side
  const { data: counts } = await supabase
    .from('saves')
    .select('collection_id')
    .not('collection_id', 'is', null)

  const countMap: Record<string, number> = {}
  counts?.forEach(s => {
    if (s.collection_id) countMap[s.collection_id] = (countMap[s.collection_id] ?? 0) + 1
  })

  return cols.map(c => ({ ...c, save_count: countMap[c.id] ?? 0 })) as Collection[]
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

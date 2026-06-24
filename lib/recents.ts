import * as SecureStore from 'expo-secure-store'

const KEY = 'trove.recent_searches'
const MAX = 8

export async function getRecentSearches(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

// Pushes a term to the front, de-duplicated (case-insensitive), capped at MAX.
export async function addRecentSearch(term: string): Promise<string[]> {
  const t = term.trim()
  if (!t) return getRecentSearches()
  const current = await getRecentSearches()
  const next = [t, ...current.filter(x => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX)
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(next))
  } catch {
    // non-fatal — recents are a convenience, not critical state
  }
  return next
}

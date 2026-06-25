import * as SecureStore from 'expo-secure-store'

const KEY = 'trove.settings'

export interface Settings {
  autoOrganize: boolean
  aiSuggestTags: boolean
  aiSuggestCollections: boolean
}

const DEFAULTS: Settings = {
  autoOrganize: true,
  aiSuggestTags: true,
  aiSuggestCollections: true,
}

export async function getSettings(): Promise<Settings> {
  try {
    const raw = await SecureStore.getItemAsync(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

// Merges a partial update into the stored settings and returns the result.
export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch }
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(next))
  } catch {
    // non-fatal — preferences are a convenience, not critical state
  }
  return next
}

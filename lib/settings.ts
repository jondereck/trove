import * as SecureStore from 'expo-secure-store'

const KEY = 'trove.settings'

export type AppearanceMode = 'system' | 'light' | 'dark'
export type DigestCadence = 'daily' | 'weekly'

export interface Settings {
  autoOrganize: boolean
  aiSuggestTitleDescription: boolean
  aiSuggestTags: boolean
  aiSuggestCollections: boolean
  libraryView: 'grid' | 'list'
  /** When true, OS shares open the QuickSave preview (with AI). When false, auto-save to Unsorted. */
  shareReviewModal: boolean
  appearance: AppearanceMode
  /** Local inbox digest notification master switch. */
  digestEnabled: boolean
  digestCadence: DigestCadence
  /** Local hour 0–23 for the digest. */
  digestHour: number
  /** 0=Sunday … 6=Saturday when cadence is weekly. */
  digestWeekday: number
}

const DEFAULTS: Settings = {
  autoOrganize: true,
  aiSuggestTitleDescription: true,
  aiSuggestTags: true,
  aiSuggestCollections: true,
  libraryView: 'grid',
  shareReviewModal: false,
  appearance: 'system',
  digestEnabled: false,
  digestCadence: 'weekly',
  digestHour: 10,
  digestWeekday: 0,
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

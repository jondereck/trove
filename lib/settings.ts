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
  /** When true, QuickSave pre-fills a clipboard URL on + tap. */
  clipboardAutoPaste: boolean
  appearance: AppearanceMode
  /** Local inbox digest notification master switch. */
  digestEnabled: boolean
  digestCadence: DigestCadence
  /** Local hour 0–23 for the digest. */
  digestHour: number
  /** 0=Sunday … 6=Saturday when cadence is weekly. */
  digestWeekday: number
  /** Daily automatic local-device backup master switch. */
  autoBackupEnabled: boolean
}

const DEFAULTS: Settings = {
  autoOrganize: true,
  aiSuggestTitleDescription: true,
  aiSuggestTags: true,
  aiSuggestCollections: true,
  libraryView: 'grid',
  shareReviewModal: false,
  clipboardAutoPaste: true,
  appearance: 'system',
  digestEnabled: false,
  digestCadence: 'weekly',
  digestHour: 10,
  digestWeekday: 0,
  autoBackupEnabled: true,
}

type SecureStoreAdapter = {
  getItemAsync: (key: string) => Promise<string | null>
  setItemAsync: (key: string, value: string) => Promise<void>
}

let secureStore: SecureStoreAdapter | null = null

function resolveSecureStore(): SecureStoreAdapter {
  if (secureStore) return secureStore
  // Lazy require keeps node:test from loading react-native via expo-secure-store.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  secureStore = require('expo-secure-store') as SecureStoreAdapter
  return secureStore
}

export function __resetSecureStoreForTests(adapter: SecureStoreAdapter): void {
  secureStore = adapter
}

export async function getSettings(): Promise<Settings> {
  try {
    const raw = await resolveSecureStore().getItemAsync(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

// Merges a partial update into the stored settings and returns the result.
export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch }
  try {
    await resolveSecureStore().setItemAsync(KEY, JSON.stringify(next))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save settings.'
    throw new Error(message)
  }
  return next
}

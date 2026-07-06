import AsyncStorage from '@react-native-async-storage/async-storage'
import { Save } from '../types'
import { fetchOGMetadata } from './ai'
import * as db from './db'

// Re-fetches OG thumbnails for link saves whose image is missing or broken
// (e.g. after a backup restore, or when a host's CDN URL expired). Attempts
// are throttled per save for 24h — recorded before the fetch — so a page
// with no OG image can't trigger a scrape loop from every card render.

const ATTEMPTS_KEY = 'trove.thumbRepair.attempts'
const ATTEMPT_TTL = 24 * 60 * 60 * 1000

let attemptsCache: Record<string, number> | null = null
const inFlight = new Set<string>()

async function loadAttempts(): Promise<Record<string, number>> {
  if (attemptsCache) return attemptsCache
  let stored: Record<string, number> = {}
  try {
    const raw = await AsyncStorage.getItem(ATTEMPTS_KEY)
    if (raw) stored = JSON.parse(raw)
  } catch { /* start fresh */ }
  const now = Date.now()
  for (const id of Object.keys(stored)) {
    if (now - stored[id] > ATTEMPT_TTL) delete stored[id]
  }
  attemptsCache = stored
  return stored
}

async function recordAttempt(id: string) {
  const attempts = await loadAttempts()
  attempts[id] = Date.now()
  AsyncStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts)).catch(() => {})
}

// Returns the new image URL if a thumbnail was fetched and stored, else null.
export async function repairThumbnail(
  save: Pick<Save, 'id' | 'type' | 'url'>,
  opts: { force?: boolean } = {}
): Promise<string | null> {
  if (save.type !== 'link' || !save.url) return null
  if (inFlight.has(save.id)) return null
  if (!opts.force) {
    const attempts = await loadAttempts()
    if (attempts[save.id]) return null
  }

  inFlight.add(save.id)
  try {
    await recordAttempt(save.id)
    const meta = await fetchOGMetadata(save.url)
    if (!meta.image) return null
    const ok = await db.updateSave(save.id, { image_url: meta.image })
    return ok ? meta.image : null
  } catch {
    return null
  } finally {
    inFlight.delete(save.id)
  }
}

// Sequential on purpose — keeps the fetch-og function from being hammered
// when a big backup lands. Returns how many thumbnails were repaired.
export async function repairMissingThumbnails(saves: Save[], limit = 25): Promise<number> {
  const candidates = saves
    .filter(s => s.type === 'link' && !!s.url && !s.image_url)
    .slice(0, limit)

  let repaired = 0
  for (const save of candidates) {
    if (await repairThumbnail(save)) repaired++
  }
  return repaired
}

import type { Save } from '../types'

export function countUnreadLibrarySaves(saves: Save[]): number {
  return saves.filter(s => s.is_viewed === false).length
}

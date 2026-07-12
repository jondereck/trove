import type { Collection } from '../types'

export const MAX_PINNED_COLLECTIONS = 3

export function countPinnedCollections(collections: Collection[]): number {
  return collections.filter(c => c.is_pinned).length
}

export function canPinMoreCollections(collections: Collection[], excludeId?: string): boolean {
  const pinned = collections.filter(c => c.is_pinned && c.id !== excludeId)
  return pinned.length < MAX_PINNED_COLLECTIONS
}

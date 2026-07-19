import type { LibraryFilter } from '../types'

let pending: LibraryFilter | null = null

export function setLibraryFilterIntent(filter: LibraryFilter): void {
  pending = filter
}

export function consumeLibraryFilterIntent(): LibraryFilter | null {
  const next = pending
  pending = null
  return next
}

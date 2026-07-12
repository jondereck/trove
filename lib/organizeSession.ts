import { OrganizeSuggestion } from '../types'

export interface OrganizeEditState {
  collection: string
  tags: string[]
}

// In-memory only — cleared when the app process exits. Avoids re-billing AI if
// the organize sheet is dismissed accidentally and reopened in the same session.

const suggestions = new Map<string, OrganizeSuggestion>()
const edits = new Map<string, OrganizeEditState>()
let reviewIndex = 0
let inflightKey: string | null = null
let inflight: Promise<OrganizeSuggestion[]> | null = null

export function getOrganizeSuggestion(saveId: string): OrganizeSuggestion | undefined {
  return suggestions.get(saveId)
}

export function getOrganizeEdit(saveId: string): OrganizeEditState | undefined {
  return edits.get(saveId)
}

export function setOrganizeEdit(saveId: string, edit: OrganizeEditState): void {
  edits.set(saveId, edit)
}

export function cacheOrganizeSuggestions(items: OrganizeSuggestion[]): void {
  items.forEach(s => suggestions.set(s.save.id, s))
}

export function missingOrganizeIds(saveIds: string[]): string[] {
  return saveIds.filter(id => !suggestions.has(id))
}

export function getOrganizeReviewIndex(): number {
  return reviewIndex
}

export function setOrganizeReviewIndex(index: number): void {
  reviewIndex = Math.max(0, index)
}

export function removeOrganizeSave(saveId: string): void {
  suggestions.delete(saveId)
  edits.delete(saveId)
}

export function getInflightOrganize(key: string): Promise<OrganizeSuggestion[]> | null {
  return inflightKey === key ? inflight : null
}

export function trackInflightOrganize(key: string, promise: Promise<OrganizeSuggestion[]>): void {
  inflightKey = key
  inflight = promise.finally(() => {
    if (inflightKey === key) {
      inflightKey = null
      inflight = null
    }
  })
}

export function organizeMissingKey(ids: string[]): string {
  return [...ids].sort().join('|')
}

export function buildQueueFromSaves(saveIds: string[]): OrganizeSuggestion[] {
  return saveIds
    .map(id => suggestions.get(id))
    .filter(Boolean) as OrganizeSuggestion[]
}

export function clearOrganizeSession(): void {
  suggestions.clear()
  edits.clear()
  reviewIndex = 0
  inflightKey = null
  inflight = null
}

// Data-layer router.
//
// Every screen imports from here and is unaware of where data lives. When a
// user is signed in we hit Supabase (lib/cloudDb.ts); otherwise we read/write
// the device-local store (lib/localDb.ts). The two modules share the same
// function signatures, so routing is a one-line delegate per call.

import { isLoggedIn } from './session'
import * as cloud from './cloudDb'
import * as local from './localDb'
import { emitDataChange } from './dataEvents'
import { getTier, hasCloud } from './entitlements'
import { FREE_SAVE_CAP, FREE_COLLECTION_CAP } from '../constants/limits'
import type { LibraryPageOptions } from '../types'

export type { Profile } from './cloudDb'

// Cloud storage is part of the Cloud subscription: signed-in users without it
// keep reading/writing the device-local store.
const pick = () => (isLoggedIn() && hasCloud() ? cloud : local)

// Thrown when a free-tier cap blocks a write. Callers surface it as an
// upgrade prompt instead of a generic failure.
export class LimitReachedError extends Error {
  constructor(public readonly kind: 'saves' | 'collections', public readonly cap: number) {
    super(
      kind === 'saves'
        ? `Free plan is limited to ${cap} saves.`
        : `Free plan is limited to ${cap} collections.`
    )
    this.name = 'LimitReachedError'
  }
}

async function assertSaveCapacity() {
  if (getTier() !== 'free') return
  const { saves } = await pick().fetchCounts()
  if (saves >= FREE_SAVE_CAP) throw new LimitReachedError('saves', FREE_SAVE_CAP)
}

async function assertCollectionCapacity() {
  if (getTier() !== 'free') return
  const { collections } = await pick().fetchCounts()
  if (collections >= FREE_COLLECTION_CAP) throw new LimitReachedError('collections', FREE_COLLECTION_CAP)
}

// ── Saves ─────────────────────────────────────────────────────────────────────
export const fetchLibrarySaves = () => pick().fetchLibrarySaves()
export const fetchLibrarySavesPage = (opts: LibraryPageOptions) => pick().fetchLibrarySavesPage(opts)
export const fetchLibraryCount = () => pick().fetchLibraryCount()
export const fetchInboxSaves = () => pick().fetchInboxSaves()
export const fetchInboxUnreadCount = () => pick().fetchInboxUnreadCount()
export const fetchUnreadLibraryCount = () => pick().fetchUnreadLibraryCount()
export const fetchSave = (id: string) => pick().fetchSave(id)
export const fetchSaveById = (id: string) => pick().fetchSaveById(id)
export const fetchCollectionSaves = (collectionId: string) => pick().fetchCollectionSaves(collectionId)
export const fetchSavesByCollection = (collectionId: string) => pick().fetchSavesByCollection(collectionId)
export const searchSaves = (query: string) => pick().searchSaves(query)
export const searchCollections = (query: string) => pick().searchCollections(query)
export const fetchSearchSuggestions = () => pick().fetchSearchSuggestions()
export const findSaveByUrl = (url: string) => pick().findSaveByUrl(url)
export async function createSave(input: Parameters<typeof cloud.createSave>[0]) {
  // URL saves that dedupe against an existing item shouldn't hit the cap.
  if (input.url) {
    const existing = await pick().findSaveByUrl(input.url)
    if (existing) return existing
  }
  await assertSaveCapacity()
  const save = await pick().createSave(input)
  if (save) emitDataChange('saves')
  return save
}
export async function updateSave(id: string, updates: Parameters<typeof cloud.updateSave>[1]) {
  const updated = await pick().updateSave(id, updates)
  if (updated) emitDataChange('saves')
  return updated
}
export async function deleteSave(id: string) {
  const deleted = await pick().deleteSave(id)
  if (deleted) emitDataChange('saves')
  return deleted
}

// ── Collections ───────────────────────────────────────────────────────────────
export const fetchCollections = () => pick().fetchCollections()
export const fetchCollection = (id: string) => pick().fetchCollection(id)
export const fetchCollectionById = (id: string) => pick().fetchCollectionById(id)
export async function createCollection(input: Parameters<typeof cloud.createCollection>[0]) {
  await assertCollectionCapacity()
  const collection = await pick().createCollection(input)
  if (collection) emitDataChange('collections')
  return collection
}
export async function updateCollection(id: string, updates: Parameters<typeof cloud.updateCollection>[1]) {
  const updated = await pick().updateCollection(id, updates)
  if (updated) emitDataChange('collections')
  return updated
}
export async function deleteCollection(id: string) {
  const deleted = await pick().deleteCollection(id)
  if (deleted) emitDataChange('collections')
  return deleted
}
export async function upsertCollectionByName(name: string) {
  // Only creating a new collection counts against the cap — matching an
  // existing one by name passes through.
  if (getTier() === 'free') {
    const existing = await pick().fetchCollections()
    const match = existing.find(c => c.name.toLowerCase() === name.trim().toLowerCase())
    if (!match) await assertCollectionCapacity()
  }
  const id = await pick().upsertCollectionByName(name)
  if (id) emitDataChange('collections')
  return id
}

// ── Profile / stats ─────────────────────────────────────────────────────────────
// Profile is account metadata (name, avatar, email), not library data — it
// follows the login, not the Cloud subscription.
const pickProfile = () => (isLoggedIn() ? cloud : local)
export const fetchProfile = () => pickProfile().fetchProfile()
export const updateProfile = (updates: Parameters<typeof cloud.updateProfile>[0]) => pickProfile().updateProfile(updates)
export const fetchCounts = () => pick().fetchCounts()

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

export type { Profile } from './cloudDb'

const pick = () => (isLoggedIn() ? cloud : local)

// ── Saves ─────────────────────────────────────────────────────────────────────
export const fetchLibrarySaves = () => pick().fetchLibrarySaves()
export const fetchInboxSaves = () => pick().fetchInboxSaves()
export const fetchSave = (id: string) => pick().fetchSave(id)
export const fetchSaveById = (id: string) => pick().fetchSaveById(id)
export const fetchCollectionSaves = (collectionId: string) => pick().fetchCollectionSaves(collectionId)
export const fetchSavesByCollection = (collectionId: string) => pick().fetchSavesByCollection(collectionId)
export const searchSaves = (query: string) => pick().searchSaves(query)
export const searchCollections = (query: string) => pick().searchCollections(query)
export const fetchSearchSuggestions = () => pick().fetchSearchSuggestions()
export const findSaveByUrl = (url: string) => pick().findSaveByUrl(url)
export async function createSave(input: Parameters<typeof cloud.createSave>[0]) {
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
  const id = await pick().upsertCollectionByName(name)
  if (id) emitDataChange('collections')
  return id
}

// ── Profile / stats ─────────────────────────────────────────────────────────────
export const fetchProfile = () => pick().fetchProfile()
export const updateProfile = (updates: Parameters<typeof cloud.updateProfile>[0]) => pick().updateProfile(updates)
export const fetchCounts = () => pick().fetchCounts()

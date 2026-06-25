// Data-layer router.
//
// Every screen imports from here and is unaware of where data lives. When a
// user is signed in we hit Supabase (lib/cloudDb.ts); otherwise we read/write
// the device-local store (lib/localDb.ts). The two modules share the same
// function signatures, so routing is a one-line delegate per call.

import { isLoggedIn } from './session'
import * as cloud from './cloudDb'
import * as local from './localDb'

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
export const fetchSearchSuggestions = () => pick().fetchSearchSuggestions()
export const findSaveByUrl = (url: string) => pick().findSaveByUrl(url)
export const createSave = (input: Parameters<typeof cloud.createSave>[0]) => pick().createSave(input)
export const updateSave = (id: string, updates: Parameters<typeof cloud.updateSave>[1]) => pick().updateSave(id, updates)
export const deleteSave = (id: string) => pick().deleteSave(id)

// ── Collections ───────────────────────────────────────────────────────────────
export const fetchCollections = () => pick().fetchCollections()
export const fetchCollection = (id: string) => pick().fetchCollection(id)
export const fetchCollectionById = (id: string) => pick().fetchCollectionById(id)
export const createCollection = (input: Parameters<typeof cloud.createCollection>[0]) => pick().createCollection(input)
export const updateCollection = (id: string, updates: Parameters<typeof cloud.updateCollection>[1]) => pick().updateCollection(id, updates)
export const deleteCollection = (id: string) => pick().deleteCollection(id)
export const upsertCollectionByName = (name: string) => pick().upsertCollectionByName(name)

// ── Profile / stats ─────────────────────────────────────────────────────────────
export const fetchProfile = () => pick().fetchProfile()
export const updateProfile = (updates: Parameters<typeof cloud.updateProfile>[0]) => pick().updateProfile(updates)
export const fetchCounts = () => pick().fetchCounts()

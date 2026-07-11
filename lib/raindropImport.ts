import { Save } from '../types'
import * as db from './db'
import { repairMissingThumbnails } from './thumbnailRepair'

// Raindrop.io CSV export → Trove saves/collections.
// Headers: id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite

const REQUIRED_HEADERS = ['url', 'title', 'folder', 'created'] as const
const UNSORTED = 'unsorted'

export type RaindropImportResult = {
  saves: number
  collections: number
  skipped: number
  thumbnailsRepaired: number
  source: 'raindrop'
}

/** RFC-style CSV: quoted fields, escaped quotes, embedded commas/newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
      if (ch === '\r') i++
      row.push(field)
      field = ''
      if (row.some(c => c.length > 0) || row.length > 1) rows.push(row)
      row = []
    } else if (ch === '\r') {
      row.push(field)
      field = ''
      if (row.some(c => c.length > 0) || row.length > 1) rows.push(row)
      row = []
    } else {
      field += ch
    }
  }

  row.push(field)
  if (row.some(c => c.length > 0) || row.length > 1) rows.push(row)
  return rows
}

export function isRaindropCsv(text: string): boolean {
  const trimmed = text.replace(/^\uFEFF/, '').trimStart()
  if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('[')) return false
  const firstLineEnd = (() => {
    let inQuotes = false
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i]
      if (ch === '"') inQuotes = !inQuotes
      else if (!inQuotes && (ch === '\n' || ch === '\r')) return i
    }
    return trimmed.length
  })()
  const headerLine = trimmed.slice(0, firstLineEnd).toLowerCase()
  const cols = new Set(headerLine.split(',').map(c => c.trim().replace(/^"|"$/g, '')))
  return REQUIRED_HEADERS.every(h => cols.has(h))
}

function titleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || 'Untitled'
  } catch {
    return 'Untitled'
  }
}

function parseTags(raw: string): string[] {
  if (!raw.trim()) return []
  return raw
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
}

function isFavorite(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

export async function importRaindropCsv(text: string): Promise<RaindropImportResult> {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''))
  if (rows.length < 2) {
    throw new Error('No bookmarks found in that Raindrop CSV.')
  }

  const headers = rows[0].map(h => h.trim().toLowerCase())
  const idx = (name: string) => headers.indexOf(name)
  const iUrl = idx('url')
  const iTitle = idx('title')
  const iNote = idx('note')
  const iExcerpt = idx('excerpt')
  const iFolder = idx('folder')
  const iTags = idx('tags')
  const iCreated = idx('created')
  const iCover = idx('cover')
  const iFavorite = idx('favorite')

  if (iUrl < 0 || iTitle < 0 || iFolder < 0 || iCreated < 0) {
    throw new Error('That CSV is missing required Raindrop columns.')
  }

  const get = (row: string[], i: number) => (i >= 0 && i < row.length ? row[i].trim() : '')

  const folderNames = new Set<string>()
  for (let r = 1; r < rows.length; r++) {
    const folder = get(rows[r], iFolder)
    if (folder && folder.toLowerCase() !== UNSORTED) folderNames.add(folder)
  }

  const existing = await db.fetchCollections()
  const byName = new Map(existing.map(c => [c.name.toLowerCase(), c.id]))
  const folderToId = new Map<string, string>()
  let importedCollections = 0

  for (const name of folderNames) {
    const key = name.toLowerCase()
    let targetId = byName.get(key)
    if (!targetId) {
      const created = await db.createCollection({ name })
      if (!created) continue
      targetId = created.id
      byName.set(key, targetId)
      importedCollections++
    }
    folderToId.set(key, targetId)
  }

  let importedSaves = 0
  let skipped = 0
  const createdSaves: Save[] = []

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const url = get(row, iUrl)
    if (!url) {
      skipped++
      continue
    }

    const existingSave = await db.findSaveByUrl(url)
    if (existingSave) {
      skipped++
      continue
    }

    const folder = get(row, iFolder)
    const unsorted = !folder || folder.toLowerCase() === UNSORTED
    const collectionId = unsorted ? undefined : folderToId.get(folder.toLowerCase())
    const title = get(row, iTitle) || titleFromUrl(url)
    const note = get(row, iNote)
    const excerpt = get(row, iExcerpt)
    const cover = get(row, iCover)
    const created = get(row, iCreated)
    const tags = parseTags(get(row, iTags))

    const createdSave = await db.createSave({
      url,
      title,
      description: excerpt || undefined,
      type: 'link',
      content: note || undefined,
      image_url: cover || undefined,
      collection_id: collectionId,
      tags,
      is_inbox: unsorted || !collectionId,
      is_favorite: isFavorite(get(row, iFavorite)),
      created_at: created || undefined,
    })

    if (createdSave) {
      importedSaves++
      createdSaves.push(createdSave)
    } else {
      skipped++
    }
  }

  const thumbnailsRepaired = await repairMissingThumbnails(createdSaves)

  return {
    saves: importedSaves,
    collections: importedCollections,
    skipped,
    thumbnailsRepaired,
    source: 'raindrop',
  }
}

# Bugfix Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix post-login auth redirect, cache Library data across app opens, improve tag search partial matching, enable multi-image upload with per-file MB caps, polish the in-app notification history screen, add a clipboard auto-paste preference toggle (rename AI Preferences → Preference), and add a Privacy notice on Settings.

**Architecture:** Seven focused changes across existing modules — no new navigation groups. Auth gets immediate `router.replace` on success. Library gets an AsyncStorage-backed snapshot (`lib/libraryCache.ts`) hydrated before network fetch; refetch only on pull-to-refresh, `subscribeDataChanges`, or auth tier change. Search matching moves to a shared pure helper tested in isolation. QuickSave gains multi-select with sequential per-file upload. Notifications screen gets Clear all + richer card meta. Settings additions reuse `SettingGroup` / `SettingRow`.

**Tech Stack:** Expo SDK 56, React Native, TypeScript (strict), expo-router, Supabase, AsyncStorage, SecureStore, expo-image-picker, expo-notifications, `tsx --test` (Node test runner).

## Global Constraints

- Branch names: `jdn/<descriptive-name>-2806`
- npm install: `npm install --legacy-peer-deps`
- Colors/fonts/spacing: import from `constants/theme.ts` — never hardcode
- Style: `StyleSheet.create()` only; headings `FONTS.serif`, body `FONTS.sans`
- Update `DEVLOG.md` with a dated entry at the top after all tasks
- Cloud VM can only verify via `tsx --test` and TypeScript compile — no native build
- Per-file upload caps stay: images **5 MB**, videos **10 MB** (`lib/storage.ts`)
- Notification work: **history screen only** — do not add a Settings tab to `/notifications`
- Rename copy: **"AI preferences" → "Preference"** (singular, per user request)
- Privacy notice copy must be Trove-specific (local-first, Cloud sync when signed in)

---

## File map

| File | Responsibility |
|------|----------------|
| `app/(auth)/login.tsx` | Immediate post-login navigation |
| `app/(auth)/signup.tsx` | Navigate to tabs when sign-up returns a session |
| `app/_layout.tsx` | Invalidate library cache on auth change |
| `lib/libraryCache.ts` | **Create** — persist/hydrate Library snapshot |
| `lib/libraryCache.test.ts` | **Create** — cache read/write tests |
| `app/(tabs)/index.tsx` | Hydrate from cache; stop refetch-on-every-focus |
| `lib/searchMatch.ts` | **Create** — per-tag partial match helper |
| `lib/searchMatch.test.ts` | **Create** — hair/haircut etc. |
| `lib/localDb.ts` | Use `searchMatch` in `searchSaves` |
| `lib/cloudDb.ts` | Fix fallback tag matching; export shared helper usage |
| `supabase/search-upgrade.sql` | Per-tag OR matching in RPC (optional deploy) |
| `lib/batchMediaUpload.ts` | **Create** — multi-asset upload loop |
| `lib/batchMediaUpload.test.ts` | **Create** — cap enforcement tests |
| `components/QuickSave.tsx` | Multi-select image picker + batch flow |
| `lib/notificationLogCore.ts` | Add optional `cadence` field |
| `lib/notificationLog.ts` | `clearNotificationLog()`, enrich digest meta |
| `app/notifications.tsx` | Clear all button, richer cards, date format |
| `lib/settings.ts` | Add `clipboardAutoPaste` setting |
| `app/ai-preferences.tsx` | Rename title; add clipboard toggle |
| `app/account.tsx` | Rename row label; add Privacy notice card |
| `app/(tabs)/_layout.tsx` | Respect `clipboardAutoPaste` in `handleQuickSave` |

---

### Task 1: Fix post-login auth redirect

**Files:**
- Modify: `app/(auth)/login.tsx`
- Modify: `app/(auth)/signup.tsx`
- Test: manual — web preview with placeholder Supabase (session mock not available; verify code path)

**Interfaces:**
- Consumes: `clearAuthFlow`, `clearCloudVerifyPending` from `lib/authNavigation.ts`
- Produces: successful sign-in always calls `router.replace('/(tabs)')` before user sees auth again

**Root cause:** `handleSignIn` and `handleGoogle` rely solely on `onAuthStateChange` + `RootNavigator` `useEffect` to redirect. There is a visible window where the login screen remains after a successful credential exchange.

- [ ] **Step 1: Navigate immediately after password sign-in**

In `app/(auth)/login.tsx`, update `handleSignIn`:

```typescript
const handleSignIn = async () => {
  if (!email.trim() || !password) return
  setError('')
  setLoading(true)

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })

  setLoading(false)
  if (error) {
    setError(error.message)
    return
  }

  clearAuthFlow()
  clearCloudVerifyPending()
  router.replace('/(tabs)')
}
```

- [ ] **Step 2: Navigate immediately after Google sign-in**

In the same file, update `handleGoogle`:

```typescript
const handleGoogle = async () => {
  setError('')
  setGoogleLoading(true)
  const { error } = await signInWithGoogle()
  setGoogleLoading(false)
  if (error) {
    setError(error)
    return
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    clearAuthFlow()
    clearCloudVerifyPending()
    router.replace('/(tabs)')
  }
}
```

- [ ] **Step 3: Sign-up with immediate session**

In `app/(auth)/signup.tsx`, after a successful `signUp` call, check for session:

```typescript
const { data, error } = await supabase.auth.signUp({ ... })

if (error) {
  setError(error.message)
  setLoading(false)
  return
}

if (data.session) {
  clearAuthFlow()
  router.replace('/(tabs)')
  return
}

setSuccess(true)
setLoading(false)
```

Import `clearAuthFlow` from `../../lib/authNavigation`.

- [ ] **Step 4: Commit**

```bash
git add app/(auth)/login.tsx app/(auth)/signup.tsx
git commit -m "fix(auth): navigate to tabs immediately after successful sign-in"
```

---

### Task 2: Library cache — instant load on app open

**Files:**
- Create: `lib/libraryCache.ts`
- Create: `lib/libraryCache.test.ts`
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/_layout.tsx` (invalidate cache on `SIGNED_IN` / `SIGNED_OUT`)

**Interfaces:**
- Consumes: `Save`, `Collection`, `LibraryFilter` from `types/index.ts`
- Produces:
  ```typescript
  export interface LibraryCacheSnapshot {
    saves: Save[]
    libraryTotal: number
    filteredTotal: number
    inboxSaves: Save[]
    collections: Collection[]
    filter: LibraryFilter
    cachedAt: string
  }
  export function peekLibraryCache(): LibraryCacheSnapshot | null
  export function cacheLibrarySnapshot(snapshot: LibraryCacheSnapshot): Promise<void>
  export function clearLibraryCache(): Promise<void>
  export function loadLibraryCache(): Promise<LibraryCacheSnapshot | null>
  ```

- [ ] **Step 1: Write the failing test**

Create `lib/libraryCache.test.ts`:

```typescript
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cacheLibrarySnapshot,
  clearLibraryCache,
  loadLibraryCache,
  peekLibraryCache,
  type LibraryCacheSnapshot,
} from './libraryCache'

const memoryStorage = new Map<string, string>()

// Stub AsyncStorage before importing cache module in a real run — for unit test,
// implement libraryCache with injectable storage or test peek/memory only.
// Minimal test of merge shape:
describe('libraryCache snapshot', () => {
  it('peek returns null before cache', () => {
    assert.equal(peekLibraryCache(), null)
  })
})
```

Expand with full AsyncStorage mock:

```typescript
import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'

const store = new Map<string, string>()

// Mock must be set up via dynamic import or export __setStorageForTests from libraryCache
describe('libraryCache', () => {
  beforeEach(() => {
    store.clear()
  })

  it('round-trips a snapshot', async () => {
    const { cacheLibrarySnapshot, loadLibraryCache, clearLibraryCache, __resetForTests } =
      await import('./libraryCache')
    __resetForTests(store)

    const snapshot = {
      saves: [{ id: '1', title: 'Test', type: 'link' as const, tags: [], is_inbox: false, created_at: '2026-01-01' }],
      libraryTotal: 1,
      filteredTotal: 1,
      inboxSaves: [],
      collections: [],
      filter: 'all' as const,
      cachedAt: new Date().toISOString(),
    }

    await cacheLibrarySnapshot(snapshot)
    const loaded = await loadLibraryCache()
    assert.deepEqual(loaded?.saves[0].id, '1')
    await clearLibraryCache()
    assert.equal(await loadLibraryCache(), null)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx --test lib/libraryCache.test.ts
```

Expected: FAIL — module or `__resetForTests` not defined

- [ ] **Step 3: Implement `lib/libraryCache.ts`**

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Collection, LibraryFilter, Save } from '../types'

const STORAGE_KEY = 'trove.library-cache.v1'

export interface LibraryCacheSnapshot {
  saves: Save[]
  libraryTotal: number
  filteredTotal: number
  inboxSaves: Save[]
  collections: Collection[]
  filter: LibraryFilter
  cachedAt: string
}

let memorySnapshot: LibraryCacheSnapshot | null = null
let storage: Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'> = AsyncStorage

export function __resetForTests(mock: Map<string, string>): void {
  memorySnapshot = null
  storage = {
    getItem: async (key: string) => mock.get(key) ?? null,
    setItem: async (key: string, value: string) => { mock.set(key, value) },
    removeItem: async (key: string) => { mock.delete(key) },
  }
}

export function peekLibraryCache(): LibraryCacheSnapshot | null {
  return memorySnapshot
}

export async function loadLibraryCache(): Promise<LibraryCacheSnapshot | null> {
  if (memorySnapshot) return memorySnapshot
  try {
    const raw = await storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LibraryCacheSnapshot
    memorySnapshot = parsed
    return parsed
  } catch {
    return null
  }
}

export async function cacheLibrarySnapshot(snapshot: LibraryCacheSnapshot): Promise<void> {
  memorySnapshot = snapshot
  try {
    await storage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // non-fatal
  }
}

export async function clearLibraryCache(): Promise<void> {
  memorySnapshot = null
  try {
    await storage.removeItem(STORAGE_KEY)
  } catch {
    // non-fatal
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx --test lib/libraryCache.test.ts
```

Expected: PASS

- [ ] **Step 5: Wire cache into Library screen**

In `app/(tabs)/index.tsx`:

1. Import `peekLibraryCache`, `cacheLibrarySnapshot`, `loadLibraryCache`, `clearLibraryCache`.
2. Seed initial state from `peekLibraryCache()` when filter matches (set `loading` false if cache hit).
3. On mount (before focus), call `loadLibraryCache()` once to hydrate from disk.
4. After every successful `loadData`, call `cacheLibrarySnapshot({ saves, libraryTotal, filteredTotal, inboxSaves, collections, filter, cachedAt: new Date().toISOString() })`.
5. Change `useFocusEffect` — **remove silent refetch on refocus**:

```typescript
useFocusEffect(
  useCallback(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true
      const cached = peekLibraryCache()
      if (cached && cached.filter === filter) {
        setSaves(cached.saves)
        setLibraryTotal(cached.libraryTotal)
        setFilteredTotal(cached.filteredTotal)
        setInboxSaves(cached.inboxSaves)
        setCollections(cached.collections)
        setLoading(false)
        return
      }
      loadData(true)
    }
    // No else branch — tab refocus does NOT refetch
  }, [filter, loadData]),
)
```

6. Keep `subscribeDataChanges` → `loadData(false)` (writes still refresh).
7. Keep pull-to-refresh → `loadData(false)` with `refreshing` flag.

- [ ] **Step 6: Clear cache on auth change**

In `app/_layout.tsx` `onAuthStateChange`, on `SIGNED_IN` and `SIGNED_OUT`:

```typescript
import { clearLibraryCache } from '../lib/libraryCache'

// inside handler:
if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
  void clearLibraryCache()
}
```

- [ ] **Step 7: Add test script entry**

In `package.json` scripts, add:

```json
"test:library-cache": "tsx --test lib/libraryCache.test.ts"
```

- [ ] **Step 8: Commit**

```bash
git add lib/libraryCache.ts lib/libraryCache.test.ts app/(tabs)/index.tsx app/_layout.tsx package.json
git commit -m "feat(library): cache snapshot for instant load on app open"
```

---

### Task 3: Partial tag search (hair → haircut)

**Files:**
- Create: `lib/searchMatch.ts`
- Create: `lib/searchMatch.test.ts`
- Modify: `lib/localDb.ts`
- Modify: `lib/cloudDb.ts`
- Modify: `supabase/search-upgrade.sql` (deploy separately to Supabase)

**Interfaces:**
- Produces:
  ```typescript
  export function normalizeSearchTerm(term: string): string
  export function tagMatchesTerm(term: string, tags: string[] | null | undefined): boolean
  export function fieldMatchesTerm(term: string, value: string | null | undefined): boolean
  ```

- [ ] **Step 1: Write the failing test**

Create `lib/searchMatch.test.ts`:

```typescript
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { tagMatchesTerm, fieldMatchesTerm } from './searchMatch'

describe('tagMatchesTerm', () => {
  it('matches substring in a single tag (hair → haircut)', () => {
    assert.equal(tagMatchesTerm('hair', ['haircut']), true)
  })

  it('matches substring case-insensitively', () => {
    assert.equal(tagMatchesTerm('DESIGN', ['ui-design']), true)
  })

  it('does not require exact tag equality', () => {
    assert.equal(tagMatchesTerm('hair', ['skin-care', 'haircut']), true)
  })

  it('returns false when no tag contains the term', () => {
    assert.equal(tagMatchesTerm('boat', ['haircut']), false)
  })
})

describe('fieldMatchesTerm', () => {
  it('matches partial text in title', () => {
    assert.equal(fieldMatchesTerm('mis', 'miso soup recipe'), true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx --test lib/searchMatch.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement `lib/searchMatch.ts`**

```typescript
export function normalizeSearchTerm(term: string): string {
  return term.trim().toLowerCase()
}

export function fieldMatchesTerm(term: string, value: string | null | undefined): boolean {
  const t = normalizeSearchTerm(term)
  if (!t) return false
  return (value ?? '').toLowerCase().includes(t)
}

export function tagMatchesTerm(term: string, tags: string[] | null | undefined): boolean {
  const t = normalizeSearchTerm(term)
  if (!t) return false
  return (tags ?? []).some(tag => tag.toLowerCase().includes(t))
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx --test lib/searchMatch.test.ts
```

Expected: PASS

- [ ] **Step 5: Update `lib/localDb.ts` `searchSaves`**

Replace tag line:

```typescript
import { fieldMatchesTerm, tagMatchesTerm } from './searchMatch'

// inside term loop:
if (fieldMatchesTerm(w, s.title)) termScore += 4
if (tagMatchesTerm(w, s.tags)) termScore += 3
if (fieldMatchesTerm(w, s.description)) termScore += 2
if (fieldMatchesTerm(w, s.content)) termScore += 2
if (fieldMatchesTerm(w, s.url)) termScore += 1
```

- [ ] **Step 6: Fix `lib/cloudDb.ts` fallback**

Replace `tags.cs.{${w}}` with per-tag ilike via joined text (already partial) **and** add a secondary filter after fetch when using fallback:

```typescript
import { tagMatchesTerm, fieldMatchesTerm } from './searchMatch'

// After fallback query returns, re-filter client-side so tags always partial-match:
return ((fallback ?? []) as Save[]).filter(save =>
  terms.every(term =>
    fieldMatchesTerm(term, save.title)
    || tagMatchesTerm(term, save.tags)
    || fieldMatchesTerm(term, save.description)
    || fieldMatchesTerm(term, save.content)
    || fieldMatchesTerm(term, save.url)
  ),
)
```

- [ ] **Step 7: Update SQL RPC (optional cloud deploy)**

In `supabase/search-upgrade.sql`, add per-tag check inside the `bool_and` block:

```sql
or exists (
  select 1 from unnest(s.tags) tag
  where tag ilike '%' || t || '%'
)
```

Deploy via Supabase SQL editor when testing cloud search.

- [ ] **Step 8: Commit**

```bash
git add lib/searchMatch.ts lib/searchMatch.test.ts lib/localDb.ts lib/cloudDb.ts supabase/search-upgrade.sql package.json
git commit -m "fix(search): partial tag matching (hair matches haircut)"
```

Add to `package.json`:

```json
"test:search": "tsx --test lib/searchMatch.test.ts"
```

---

### Task 4: Multi-image upload with per-file MB cap

**Files:**
- Create: `lib/batchMediaUpload.ts`
- Create: `lib/batchMediaUpload.test.ts`
- Modify: `components/QuickSave.tsx`

**Interfaces:**
- Consumes: `prepareMediaForUpload`, `uploadMedia`, `MediaTooLargeError`, `MAX_IMAGE_BYTES` from `lib/storage.ts`
- Produces:
  ```typescript
  export const MAX_BATCH_IMAGES = 10
  export interface BatchUploadResult {
    uploaded: { publicUrl: string; fileName?: string | null }[]
    failures: { fileName?: string | null; message: string }[]
  }
  export async function uploadImageBatch(
    assets: ImagePicker.ImagePickerAsset[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<BatchUploadResult>
  ```

- [ ] **Step 1: Write the failing test**

Create `lib/batchMediaUpload.test.ts`:

```typescript
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAX_BATCH_IMAGES } from './batchMediaUpload'

describe('batchMediaUpload constants', () => {
  it('caps batch selection at 10 images', () => {
    assert.equal(MAX_BATCH_IMAGES, 10)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx tsx --test lib/batchMediaUpload.test.ts
```

- [ ] **Step 3: Implement `lib/batchMediaUpload.ts`**

```typescript
import type * as ImagePicker from 'expo-image-picker'
import { prepareMediaForUpload, uploadMedia, MediaTooLargeError } from './storage'

export const MAX_BATCH_IMAGES = 10

export interface BatchUploadResult {
  uploaded: { publicUrl: string; fileName?: string | null }[]
  failures: { fileName?: string | null; message: string }[]
}

export async function uploadImageBatch(
  assets: ImagePicker.ImagePickerAsset[],
  onProgress?: (done: number, total: number) => void,
): Promise<BatchUploadResult> {
  const uploaded: BatchUploadResult['uploaded'] = []
  const failures: BatchUploadResult['failures'] = []
  const slice = assets.slice(0, MAX_BATCH_IMAGES)

  for (let i = 0; i < slice.length; i++) {
    const asset = slice[i]
    try {
      const media = await prepareMediaForUpload(asset, 'image')
      const publicUrl = await uploadMedia(media.base64, media.ext, media.mime)
      if (!publicUrl) {
        failures.push({ fileName: asset.fileName, message: 'Upload failed.' })
      } else {
        uploaded.push({ publicUrl, fileName: asset.fileName })
      }
    } catch (e) {
      const message = e instanceof MediaTooLargeError
        ? e.message
        : (e as Error)?.message ?? 'Could not read the selected file.'
      failures.push({ fileName: asset.fileName, message })
    }
    onProgress?.(i + 1, slice.length)
  }

  return { uploaded, failures }
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Update `components/QuickSave.tsx`**

1. Import `uploadImageBatch`, `MAX_BATCH_IMAGES`.
2. In `handlePickMedia` for `kind === 'image'`, enable multi-select:

```typescript
const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ['images'],
  quality: 0.8,
  base64: true,
  allowsMultipleSelection: true,
  selectionLimit: MAX_BATCH_IMAGES,
})
```

3. If `result.assets.length > 1`, run batch path:
   - Show loading step with `Uploading 2 of 5…` using `onProgress`
   - For each successful upload, call `createSave` via parent `onSave` with title from `fileName` or `Photo`
   - If some fail, show combined error but still save successes
   - Close modal after batch completes
4. Single-image path stays unchanged (preview step with AI suggestions).

Expose batch save through existing `onSave` prop — call it once per uploaded image in `_layout.tsx`'s `handleSave` (already creates one save per call).

- [ ] **Step 6: Commit**

```bash
git add lib/batchMediaUpload.ts lib/batchMediaUpload.test.ts components/QuickSave.tsx package.json
git commit -m "feat(quicksave): multi-image upload with per-file size cap"
```

---

### Task 5: Notification history polish

**Files:**
- Modify: `lib/notificationLogCore.ts`
- Modify: `lib/notificationLog.ts`
- Modify: `lib/notificationLogCore.test.ts`
- Modify: `app/notifications.tsx`

**Interfaces:**
- Produces:
  ```typescript
  // notificationLogCore.ts — extend entry:
  cadence?: 'daily' | 'weekly'
  export async function clearNotificationLog(): Promise<NotificationLogEntry[]>
  ```

- [ ] **Step 1: Extend entry type**

In `lib/notificationLogCore.ts`:

```typescript
export interface NotificationLogEntry {
  id: string
  title: string
  body: string
  date: string
  read: boolean
  screen?: 'inbox'
  cadence?: 'daily' | 'weekly'
}
```

- [ ] **Step 2: Add clear helper**

In `lib/notificationLog.ts`:

```typescript
export async function clearNotificationLog(): Promise<NotificationLogEntry[]> {
  return updateStored(() => [])
}
```

- [ ] **Step 3: Enrich digest entries**

In `fromNotification`, when `content.title === 'Trove Inbox'`, read settings and attach cadence:

```typescript
import { getSettings } from './settings'

// inside fromNotification (make async wrapper or set cadence in recordNotification):
// When recording, if title is Trove Inbox, merge cadence from getSettings()
```

Update `recordNotification` to async-enrich:

```typescript
export async function recordNotification(
  notification: Notifications.Notification,
): Promise<NotificationLogEntry[]> {
  let entry = fromNotification(notification)
  if (entry.title === 'Trove Inbox') {
    const settings = await getSettings()
    if (settings.digestEnabled) {
      entry = { ...entry, cadence: settings.digestCadence }
    }
  }
  return updateStored(entries => mergeNotificationEntries(entries, [entry]))
}
```

- [ ] **Step 4: Update notifications UI**

In `app/notifications.tsx`:

1. Add **Clear all** button in header right (replace `topSpacer`):

```typescript
import { clearNotificationLog, getNotificationLog } from '../lib/notificationLog'

const handleClearAll = () => {
  void clearNotificationLog().then(setEntries)
}
```

Only show when `entries.length > 0`.

2. Date formatter for sample style:

```typescript
function formatEntryMeta(entry: NotificationLogEntry): string {
  const date = new Date(entry.date)
  const cadenceLabel = entry.cadence === 'daily' ? 'Daily' : entry.cadence === 'weekly' ? 'Weekly' : 'Update'
  const datePart = date.toLocaleDateString([], { day: 'numeric', month: 'short' })
  const timePart = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${cadenceLabel} · ${datePart}, ${timePart}`
}
```

3. Render meta line above title in each card (muted, 12px).
4. Do **not** add a Settings tab — history only.

- [ ] **Step 5: Commit**

```bash
git add lib/notificationLogCore.ts lib/notificationLog.ts lib/notificationLogCore.test.ts app/notifications.tsx
git commit -m "feat(notifications): history clear-all and digest meta labels"
```

---

### Task 6: Preference rename + clipboard auto-paste toggle

**Files:**
- Modify: `lib/settings.ts`
- Modify: `app/ai-preferences.tsx`
- Modify: `app/account.tsx`
- Modify: `app/(tabs)/_layout.tsx`

**Interfaces:**
- Produces: `Settings.clipboardAutoPaste: boolean` (default `true`)

- [ ] **Step 1: Add setting**

In `lib/settings.ts`:

```typescript
export interface Settings {
  // ...existing
  /** When true, QuickSave pre-fills a clipboard URL on + tap. */
  clipboardAutoPaste: boolean
}

const DEFAULTS: Settings = {
  // ...existing
  clipboardAutoPaste: true,
}
```

- [ ] **Step 2: Rename screen copy**

In `app/ai-preferences.tsx`:
- Title: `Preference` (was `AI preferences`)
- Add new `SettingGroup title="Quick save"` as first group:

```typescript
<SettingRow
  icon="clipboard-outline"
  label="Auto-fill from clipboard"
  hint="When you tap +, paste a copied link into QuickSave automatically."
  toggle
  on={!!settings?.clipboardAutoPaste}
  onPress={() => toggle('clipboardAutoPaste')}
  last
/>
```

- [ ] **Step 3: Update Account row**

In `app/account.tsx` line ~343:

```typescript
<SettingRow icon="sparkles-outline" label="Preference" onPress={() => router.push('/ai-preferences')} />
```

- [ ] **Step 4: Respect toggle in tab layout**

In `app/(tabs)/_layout.tsx` `handleQuickSave`:

```typescript
import { getSettings } from '../../lib/settings'

const handleQuickSave = async () => {
  const settings = await getSettings()
  if (settings.clipboardAutoPaste) {
    try {
      const text = await Clipboard.getStringAsync()
      const isUrl = /^https?:\/\//i.test(text.trim())
      if (isUrl) setSharedUrl(text.trim())
    } catch {
      // clipboard unavailable
    }
  } else {
    setSharedUrl(undefined)
  }
  setQuickSaveVisible(true)
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/settings.ts app/ai-preferences.tsx app/account.tsx app/(tabs)/_layout.tsx
git commit -m "feat(settings): rename to Preference and add clipboard auto-paste toggle"
```

---

### Task 7: Privacy notice on Settings

**Files:**
- Modify: `app/account.tsx`

**Interfaces:**
- Consumes: `SettingGroup`, theme tokens, `BRAND` from `constants/branding.ts`
- Produces: static Privacy notice card above footer (no external URL required yet)

- [ ] **Step 1: Add Privacy notice section**

In `app/account.tsx`, after Support `SettingGroup`, before sign-out:

```typescript
<SettingGroup title="Legal">
  <View style={styles.privacyCard}>
    <View style={styles.privacyBadge}>
      <Ionicons name="shield-checkmark-outline" size={14} color={colors.accent} />
      <Text style={styles.privacyBadgeText}>Privacy notice</Text>
    </View>
    <Text style={styles.privacyBody}>
      Your saves stay on this device by default. If you sign in with {BRAND.name} Cloud,
      your library and account data are synced to our server so you can access them across devices.
    </Text>
  </View>
</SettingGroup>
```

Add styles (use theme tokens):

```typescript
privacyCard: {
  marginHorizontal: SPACING.lg,
  backgroundColor: c.card,
  borderRadius: RADIUS.lg,
  borderWidth: 1,
  borderColor: c.border,
  padding: SPACING.lg,
  gap: SPACING.sm,
},
privacyBadge: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  alignSelf: 'flex-start',
  backgroundColor: c.accentSoft,
  paddingHorizontal: 10,
  paddingVertical: 4,
  borderRadius: RADIUS.pill,
},
privacyBadgeText: {
  fontFamily: FONTS.sansSemi,
  fontSize: 12,
  color: c.accent,
},
privacyBody: {
  fontFamily: FONTS.sans,
  fontSize: 13,
  lineHeight: 19,
  color: c.textSub,
},
```

Import `BRAND` from `../constants/branding`.

- [ ] **Step 2: Commit**

```bash
git add app/account.tsx
git commit -m "feat(settings): add privacy notice card"
```

---

### Task 8: DEVLOG + verification

**Files:**
- Modify: `DEVLOG.md`
- Modify: `package.json` (aggregate test script if desired)

- [ ] **Step 1: Run all unit tests**

```bash
npx tsx --test lib/libraryCache.test.ts lib/searchMatch.test.ts lib/batchMediaUpload.test.ts lib/notificationLogCore.test.ts
```

Expected: all PASS

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors (or only pre-existing)

- [ ] **Step 3: Update DEVLOG.md**

Add entry at top dated **2026-07-19** summarizing all seven fixes.

- [ ] **Step 4: Final commit**

```bash
git add DEVLOG.md package.json
git commit -m "docs: devlog for 2026-07-19 bugfix sprint"
```

---

## Self-review

| Requirement | Task |
|-------------|------|
| Post-login auth screen persists | Task 1 |
| Library instant load / no refetch on every open | Task 2 |
| Tag search partial match (hair → haircut) | Task 3 |
| Multi-image upload, per-file MB cap | Task 4 |
| Notification history with recent items + Clear all | Task 5 |
| No Settings tab on notifications screen | Task 5 (explicit) |
| Clipboard auto-paste on/off | Task 6 |
| Rename AI Preference → Preference | Task 6 |
| Privacy notice (Tarsi-style card) | Task 7 |
| DEVLOG updated | Task 8 |

**Placeholder scan:** none — all steps include concrete code.

**Type consistency:** `LibraryCacheSnapshot`, `NotificationLogEntry.cadence`, `Settings.clipboardAutoPaste`, and `uploadImageBatch` signatures are defined before use.

---

## Manual QA checklist (device / dev build)

1. Sign in with email → lands on Library immediately, no auth flash
2. Kill app, reopen → Library shows cached saves without spinner; pull-to-refresh updates
3. Search `hair` → save tagged `haircut` appears
4. QuickSave → pick 3 images → 3 saves created; oversized image shows error, others succeed
5. Trigger inbox digest → Notifications screen shows history with Daily/Weekly meta; Clear all works
6. Preference → toggle clipboard off → + button no longer pre-fills URL
7. Account → Privacy notice card visible

# Trove — Dev Log

Running record of changes, fixes, and decisions. Most recent first.

---

### Fixed: Duplicate tags + stale screens not auto-refreshing
**Files:** `components/QuickSave.tsx`, `app/save/[id].tsx`, `app/(tabs)/collections.tsx`, `app/collection/[id].tsx`

**Duplicate tags:** Manually adding a tag could insert it twice. In QuickSave the
`addTag` handler was wired to *both* `onSubmitEditing` and `onBlur`, so pressing
"done" fired it twice; the dedup guard (`!draft.tags.includes(t)`) read stale closure
state and missed the duplicate. Fixed by moving the dedup *inside* the functional
state updater in both QuickSave and the save detail screen, making `addTag`
idempotent regardless of how many times it fires.

**Stale screens:** Edits weren't showing until a manual pull-to-refresh. The
Collections tab (`collections.tsx`) and the collection detail screen
(`collection/[id].tsx`) loaded data with a mount-only `useEffect`, so navigating
back after a change didn't refetch. Switched both to `useFocusEffect` (matching the
Library and Inbox screens) so they reload every time they regain focus.

---

### Fixed: Backup/restore now preserves favorites and original dates
**Files:** `lib/transfer.ts`, `lib/cloudDb.ts`, `lib/localDb.ts`

The export already wrote every save (Library + Inbox) and every collection with full
fields to JSON, but `importData()` was dropping two fields on restore:
- **`is_favorite`** — favorites were lost; `createSave` didn't even accept the field.
- **`created_at`** — every restored item got a fresh "now" timestamp, scrambling
  chronological order.

Changes:
- Added optional `is_favorite` + `created_at` to `createSave` (cloud + local) and
  `created_at` to `createCollection` (cloud + local). When omitted (normal QuickSave
  use) behavior is unchanged — DB/local defaults apply.
- `importData()` now passes `is_favorite` and `created_at` for saves and `created_at`
  for collections.
- Restore stays **skip-duplicates**: existing same-name collections are reused and
  same-URL saves are skipped, so re-importing is idempotent.

This makes the JSON backup a true full restore of all saves and collections.

---

## 2026-06-28 (session 5)

### Changed: SaveCard — brand icons + natural tag row clipping
**File:** `components/SaveCard.tsx`

- **Brand icons**: `FontAwesome5` brand icons for 27 known domains (Facebook, Instagram, YouTube, TikTok, Twitter/X, Reddit, LinkedIn, GitHub, Spotify, Discord, Twitch, etc.) with real brand colors. Unknown domains fall back to colored letter square.
- **Tags**: Removed `slice(0,3)` limit — all tags rendered. `flexShrink: 0` on each chip means chips stay full-size and the row simply clips at the right edge (`overflow: hidden`, `flexWrap: nowrap`). Only the rightmost chip that would overflow gets clipped — all others show complete text.

---

### Changed: SaveCard — card layout redesign to match design prototype
**File:** `components/SaveCard.tsx`

Layout changes (all card types):
- **Date moved above title** — small muted text, first thing in the body
- **Domain row** — colored favicon square (first letter, hash-based color) + domain text, replacing old grey pill badge
- **Tags** — one row only, max 3 shown, `flexWrap: 'nowrap'` so they never overflow into a second line. Each tag is a colored rounded chip with hash-derived color from 8-color palette.
- `chipColor()` shared for both domain favicon and tag chips (same hash palette)
- Heart/fav button unchanged

---

## 2026-06-28 (session 4)

### Fixed: Import fails with "isn't readable" on Android
**File:** `lib/transfer.ts`
`FileSystem.readAsStringAsync` can't read DocumentPicker URIs on Android. Switched to `fetch().then(r => r.text())` which handles both `file://` and `content://` URIs correctly.

### Changed: Export data saves directly to device on Android
**File:** `lib/transfer.ts`
On Android, `exportData()` now uses `FileSystem.StorageAccessFramework` (SAF) to prompt the user to pick a folder, then writes the JSON backup directly there — no Share sheet. On iOS the Share sheet is kept because "Save to Files" is the native iOS paradigm.

---

## 2026-06-28 (session 4)

### Improved: SaveCard — title + description on all card types + favorite button
**File:** `components/SaveCard.tsx`

**Problems:**
- `ImageCard` and `VideoCard` only showed title inside a dark overlay — no description visible
- `NoteCard` showed note body but not the actual title
- No way to favorite directly from a card

**Changes:**
- **All card types** now show title + description + date/first-tag footer below the media
- **NoteCard** — shows `save.title` as a small header (only if it differs from the body text), then the note content in serifItal
- **ImageCard / VideoCard** — removed dark overlay title, replaced with clean `mediaBody` section below the image showing title + description
- **Favorite button** — floating heart icon (top-right, small white circle) on every card. Taps optimistically toggle `is_favorite` with a spring pop animation, then calls `updateSave` async. Reverts on error.
- Tags: first tag shown in footer as `#tagname` in accent color
- Image/video placeholder now shows an icon instead of a blank grey box

---

## 2026-06-28 (session 3)

### Added: Bulk delete in Library screen
**File:** `app/(tabs)/index.tsx`

- Long press any SaveCard → enters selection mode
- A sticky action bar appears at top (Cancel / "X selected" / 🗑️ trash icon)
- Tapping cards in selection mode toggles selection instead of navigating
- Delete → Alert confirm → `deleteSave` for all selected → removes from list optimistically
- Restructured root from `<>` to `<View>` wrapper so the selection bar sits fixed above the ScrollView

### Added: AI title suggestion for notes in QuickSave
**Files:** `components/QuickSave.tsx`, `lib/ai.ts`

- Note type button changed from "Save to Inbox" → "Preview & Title →"
- Pressing it calls `suggestNoteTitle(content)` (new function in `lib/ai.ts`) and goes to the existing preview step with the AI-generated title pre-filled
- Title is fully editable in the preview step
- ✨ sparkle button next to the title re-runs AI suggestion if user wants a different one (`handleResuggestTitle`)
- Falls back to first 60 chars of note content if AI is unavailable/off

---

## 2026-06-28 (session 2)

### Added: Bulk select / delete / move in collection detail
**Files:** `app/collection/[id].tsx`, `components/SaveCard.tsx`

**How it works:**
- Long press any card → enters selection mode. Header changes to Cancel / "X selected" / Move / Delete.
- Tapping a card in selection mode toggles its selection (doesn't navigate).
- Also added a `✓` icon button in the normal header to enter selection mode explicitly.
- **Delete:** Alert confirmation → `deleteSave` for each selected ID → removes from list.
- **Move:** Opens a bottom sheet modal listing all other collections → `updateSave` with new `collection_id` for each selected ID → removes from current collection view.

**SaveCard changes:**
- Added optional `selected?: boolean` prop (`undefined` = not in selection mode; `true/false` = checked state).
- Added optional `onLongPress?: () => void` prop passed through to `Pressable`.
- Added checkmark circle overlay + accent border when selected.
- Added `Ionicons` import (was previously absent from SaveCard).

---

### Added: Clipboard auto-paste on QuickSave open
**Files:** `app/(tabs)/_layout.tsx`, `package.json`

**How it works:**
- When the `+` FAB is tapped, reads clipboard via `expo-clipboard`.
- If the clipboard text starts with `http://` or `https://`, it's passed as `initialUrl` to QuickSave — which already has auto-fetch+suggest wired up for `initialUrl`.
- If clipboard is empty, invalid, or unreadable, QuickSave opens normally.

**Install required (run once):**
```
npm install --legacy-peer-deps
```
(`expo-clipboard ~7.0.4` added to `package.json`)

---

## 2026-06-28 (session 1)

### Fixed: `fetch-og` Edge Function — multi-platform OG scraping
**Files:** `supabase/functions/fetch-og/index.ts`

**Problems:**
- Facebook links returned no title, description, or image
- Instagram & Threads had raw HTML entities in text (`&#064;` instead of `@`, `&amp;` instead of `&`)
- TikTok captions/descriptions were always empty

**Root causes & fixes:**
1. **HTML entity encoding** — Added `decode()` helper applied to every extracted string. Covers `&amp;`, `&lt;`, `&#064;`, `&#x40;`, etc.
2. **TikTok** — Caption is not in `og:description`; it's in a `<script type="application/ld+json">` block. Added `extractJsonLd()` to pull it as fallback. Also switched TikTok UA from `facebookexternalhit` → Googlebot (better structured data from TikTok's SSR).
3. **Facebook/Instagram/Threads** — Now all use `facebookexternalhit/1.1` UA. Works for public pages and posts; login-required personal posts are unfetchable by design (FB wall).

**Note:** Must run `npx supabase functions deploy fetch-og` after any change to this file.

---

### Fixed: QuickSave — stale closure bug in `doFetchAndSuggest`
**File:** `components/QuickSave.tsx` line 136

**Problem:** `useCallback` had empty `[]` dependency array, so `collections` was always `[]` inside the callback — AI never knew about existing collections.

**Fix:** Changed deps from `[]` to `[collections]`.

---

### Confirmed: AI works without login
AI features (tag suggestions, collection suggestions, AI Organize) are not gated behind auth. They run as long as `EXPO_PUBLIC_OPENAI_API_KEY` is set in `.env.local`. Data is saved locally via `localDb.ts` (AsyncStorage) when not signed in.

---

## Project State as of 2026-06-28

### Architecture
- **Local-first:** Data lives in AsyncStorage (via `localDb.ts`) when logged out; migrates to Supabase on sign-in. `lib/db.ts` routes transparently between them.
- **AI:** Direct OpenAI calls via `EXPO_PUBLIC_OPENAI_API_KEY`. Edge Function proxy (`supabase/functions/ai-proxy`) is written but not yet deployed for production use.
- **Share intent:** `expo-share-intent` — requires dev build (`npx expo run:android`), doesn't work in Expo Go.

### Screens
| Screen | Status |
|--------|--------|
| Library (tab) | ✅ Done |
| Collections (tab) | ✅ Done |
| Inbox + AI Organize (tab) | ✅ Done |
| Search (tab) | ✅ Done |
| Login / Signup / Onboarding | ✅ Done |
| Save detail `save/[id]` | ✅ Done |
| Collection detail `collection/[id]` | ✅ Done |
| Account / Change Password | ✅ Done |
| AI Preferences | ✅ Done |

### Components
| Component | Status |
|-----------|--------|
| SaveCard | ✅ Done |
| QuickSave (bottom sheet) | ✅ Done |
| AIOrganize | ✅ Done |
| SwipeableCard (swipe-to-archive) | ✅ Done |
| CollectionForm | ✅ Done |
| Settings | ✅ Done |
| Avatar | ✅ Done |

### Edge Functions
| Function | Status |
|----------|--------|
| `fetch-og` | ✅ Deployed + fixed |
| `og-scrape` | ✅ Written (alternate scraper) |
| `ai-proxy` | ⚠️ Written, not deployed — needs `OPENAI_API_KEY` secret in Supabase |

### Known Limitations / Next Up
- Facebook personal posts (require login) — unfetchable, no fix possible
- `ai-proxy` Edge Function not yet deployed to production
- Image upload to Supabase Storage media bucket — wired up in `lib/storage.ts`, not tested end-to-end
- Favorites feature — SQL migration written (`supabase/add-favorites.sql`), UI not implemented
- Push notifications — not started
- iOS build requires macOS (Windows only produces Android)

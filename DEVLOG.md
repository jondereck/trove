# Trove — Dev Log

Running record of changes, fixes, and decisions. Most recent first.

---

### Changed: AI works for guests via ai-proxy (2026-07-08)
**Files:** `lib/ai.ts`, `supabase/functions/ai-proxy/index.ts`

- Removed guest gate in `callGPT()` — guests no longer get silent empty responses.
- Switched from `supabase.functions.invoke` to direct `fetch` + anon key (matches
  `fetchOGMetadata` pattern).
- Redeployed `ai-proxy` with `--no-verify-jwt` so unsigned users can reach it.
  OpenAI key stays server-side; anon key is already public in the app binary.

---

### Deployed: ai-proxy + removed embedded OpenAI key (2026-07-08)
**Files:** `.env.local` (removed `EXPO_PUBLIC_OPENAI_API_KEY`), `.env.example`, `app.json`
(version 1.1.1, versionCode 3)

- **`ai-proxy` redeployed** to Supabase (`xullagcvhnenwpschjig`). `OPENAI_API_KEY` secret was
  already set (2026-07-06); function is ACTIVE with JWT verification.
- **Removed `EXPO_PUBLIC_OPENAI_API_KEY`** from `.env.local` so release builds no longer bundle
  the key. Signed-in users now hit `ai-proxy` via `lib/ai.ts`; guests get silent AI degrade.
- **Release build v1.1.1 deferred** — version bumped in `app.json` (versionCode 3); APK rebuild
  skipped for now (Windows Gradle path-length issues in Cursor). Next release build from a local
  terminal will ship without the embedded key.

---

### Released: v1.1.0 (versionCode 2) — first production-signed APK (2026-07-06)
**Files:** `app.json` (version 1.1.0, versionCode 2), `app/account.tsx` (footer version now read from
`Constants.expoConfig` via new `expo-constants` dep)

Built `android/app/build/outputs/apk/release/app-release.apk` (85 MB) and copied to
`Desktop/trove-v1.1.0-release.apk`. Verified with apksigner: **V2 signer CN=Trove** (production
keystore, no longer the debug key); aapt confirms `versionCode='2' versionName='1.1.0'`.

- Gotcha #1: the first keystore was created with an empty password (a PowerShell inline
  password-generation one-liner silently produced ''), so Gradle failed with "keystore password was
  incorrect" at `:app:packageRelease`. Regenerated the keystore with a step-verified password
  (keytool -list must pass before the props file is written). If signing ever fails this way again,
  check `~/.gradle/gradle.properties` for an empty `TROVE_UPLOAD_STORE_PASSWORD=` line first.
- Gotcha #2: `keytool -printcert -jarfile` says "Not a signed jar file" for this APK — that's
  expected (v2/v3 signature scheme only, no legacy v1). Use
  `apksigner verify --print-certs <apk>` instead.
- Note: this build still embeds `EXPO_PUBLIC_OPENAI_API_KEY` because `ai-proxy` isn't deployed yet
  (see manual steps below). After deploying, remove the key from `.env.local` and rebuild.

---

### Added: Zip backups with media, thumbnail repair, upload limits, secure AI key, release signing (2026-07-06)
**Files:** `lib/transfer.ts` (rewrite), `lib/storage.ts`, `lib/thumbnailRepair.ts` (new), `lib/ai.ts`,
`lib/migrateLocal.ts`, `components/QuickSave.tsx`, `components/SaveCard.tsx`, `components/AIOrganize.tsx`,
`app/save/[id].tsx`, `app/account.tsx`, `app.json`, `plugins/withReleaseSigning.js` (new), `CLAUDE.md`
**Deleted:** `lib/mockData.ts`, `supabase/functions/og-scrape/` (both dead code)
**Packages:** `react-native-zip-archive` (native zip/unzip), `expo-image-manipulator` (image downscale)

- **Backup format v2 (zip).** `exportData()` now produces `trove-backup-<ts>.zip` containing
  `backup.json` (`{version: 2, exportedAt, saves, collections}`) plus a `media/` folder with every
  device-local (`file://`) image/video. Bundled refs are rewritten to the `trove-media://<filename>`
  sentinel; cloud `https://` Storage URLs pass through untouched (the account itself is the cloud
  backup). Export stages in `cacheDirectory` with native `copyAsync` (no base64 round-trips of media),
  zips natively via `react-native-zip-archive`, then SAF (Android) / share sheet (iOS).
- **Import** accepts v2 zips AND old v1 plain-JSON backups (byte-for-byte the old path). Zips are
  detected by name/mime plus a `PK` magic-byte sniff. Bundled media is restored via
  `importMediaFile()`: signed-out → copied into `LOCAL_MEDIA_DIR`; signed-in → uploaded to Storage so
  cloud rows never hold dead `file://` paths. Missing zip entries import the save without media.
  Known limitation: re-importing the same backup duplicates image/video saves (URL dedupe only
  covers links).
- **Thumbnail repair** (`lib/thumbnailRepair.ts`). `repairThumbnail(save, {force})` re-runs
  `fetchOGMetadata` for link saves with missing/broken images, throttled 24h per save via
  AsyncStorage (`trove.thumbRepair.attempts`, recorded *before* the fetch so failures can't loop).
  Hooks: link cards self-heal once on render/error (`SaveCard.tsx`), a "Refresh preview" action on
  the save detail screen bypasses the throttle, and `importData()` runs a post-import pass
  (`repairMissingThumbnails`, sequential, 25 max) whose count shows in the import alert.
- **Upload limits.** `prepareMediaForUpload()` in `lib/storage.ts`: videos over **10 MB** are
  rejected with the actual size in the message (checked from `fileSize` before reading bytes into
  memory); photos over **5 MB** are downscaled to 1920px JPEG (new `expo-image-manipulator`
  object API) and only rejected if still over the cap. Wired into QuickSave's `handlePickMedia`,
  which also no longer requires `asset.base64` (videos are read from disk).
- **Secure AI key.** `callGPT()` now invokes the `ai-proxy` Edge Function when
  `EXPO_PUBLIC_OPENAI_API_KEY` is unset and the user is signed in; guests keep the silent
  degrade. **Manual steps pending (CLI actions require explicit approval):**
  `npx supabase functions deploy ai-proxy`, `npx supabase secrets set OPENAI_API_KEY=sk-...`,
  `npx supabase functions delete og-scrape` (stale deployment), then remove
  `EXPO_PUBLIC_OPENAI_API_KEY` from `.env.local` before release builds — that's what actually
  stops the key shipping in the APK.
- **Release signing.** Generated `C:/Users/user/keystores/trove-release.keystore` (RSA 2048,
  alias `trove`, valid ~27 yrs); credentials live in `~/.gradle/gradle.properties`
  (`TROVE_UPLOAD_*`, not in the repo). New `plugins/withReleaseSigning.js` config plugin injects
  `signingConfigs.release` (guarded by `project.hasProperty`, debug fallback) so it survives
  `prebuild --clean`. **Back up the keystore file + password** — losing them means losing the
  ability to update a published app.
- **Polish:** AIOrganize copy no longer says "Asking Claude" (backend is OpenAI); Account's fake
  Help/Privacy URLs replaced by a "Contact support" mailto row (Privacy row removed until a real
  page exists); `LOCAL_MEDIA_DIR` exported from `lib/storage.ts` instead of duplicated in
  `migrateLocal.ts`.

---

### Built: First standalone release APK (2026-07-06)
**Files:** none (build artifact only)

Produced the first standalone Android APK via a local Gradle release build:
`cd android && ./gradlew assembleRelease` (Java 17, `ANDROID_HOME` set, no `eas.json` —
built off the prebuilt `/android` folder). Output:
`android/app/build/outputs/apk/release/app-release.apk` (~97 MB universal, all ABIs),
copied to `Desktop/trove-v1.0.0-release.apk`.

- **Standalone confirmed:** APK embeds `assets/index.android.bundle` (4.3 MB) + Hermes
  (`libhermesvm.so`) for arm64-v8a, armeabi-v7a, x86, x86_64 — runs without Metro.
- **Signing caveat:** `release` buildType still uses the **debug keystore**
  (`android/app/build.gradle` line 115). Fine for sideloading/personal install; NOT
  acceptable for Play Store. A real production keystore + `signingConfigs.release` is
  still TODO if/when we publish.
- Size note: universal APK bundles all 4 ABIs. Can shrink with per-ABI splits
  (`android.enableSeparateBuildPerCPUArchitecture`) or an AAB later.

---

### Fixed: Image/video saves broke when signed out; Instagram OG scrape showed a login wall
**Files:** `lib/storage.ts`, `lib/migrateLocal.ts`, `supabase/functions/fetch-og/index.ts`

**Local-first audit.** Went through the data layer to confirm the app is usable with zero
Supabase account (cloud sync should be opt-in, not required). `lib/db.ts` already routes
transparently between `cloudDb.ts`/`localDb.ts` based on session, no screen is auth-gated, and
`lib/ai.ts`'s organize/tag/collection suggestions never check login. One real gap found:

- **`uploadMedia()`** (`lib/storage.ts`) always uploaded gallery-picked images/videos to Supabase
  Storage. Signed out, `supabase.auth.getUser()` is `null`, so it returned `null` and QuickSave
  showed "Upload failed" — Image/Video save types were unusable without an account. Fixed by
  adding `saveMediaLocally()`: signed-out picks are written to `${documentDirectory}media/` and
  the local `file://` URI is used as the save's `image_url`/`url`, same as a cloud URL would be.
- **`migrateLocalToCloud()`** (`lib/migrateLocal.ts`) now re-uploads any local `file://` media it
  finds to cloud storage during the local→cloud migration on sign-in, via the same `uploadMedia()`
  (now running signed-in, so it takes the upload branch). Otherwise a migrated save would keep
  pointing at a path that only resolves on the original device.

**Meta OG-scrape regression.** Manual test showed Instagram/Facebook thumbnails no longer
scraping (previously fixed in the 2026-06-28 session-1 entry). Root cause is external, not a
code bug: Meta has tightened bot detection specifically against the Supabase Edge Function's
(Deno Deploy) egress IPs —
- **Facebook** now times out entirely for that IP range (8s `AbortSignal.timeout` fires every
  time), even though the same URL resolves in under a second from a normal residential IP.
- **Instagram** returns HTTP 200 but with a generic **login-wall page** ("Login • Instagram",
  "Welcome back to Instagram...") instead of the real profile/post page — so the scrape looked
  successful but saved wrong metadata.
- **Threads** (same company, different domain/edge) is unaffected and still scrapes correctly.

No code fix can bypass an IP-based block from outside our infra. What was fixed: `fetch-og`
now detects the Instagram login-wall pattern (title starting with "Log in", or description
containing "welcome back to instagram" / "log in to check out") and falls back to the bare
hostname (same graceful degrade QuickSave already does on a hard fetch error), instead of
saving misleading login-page text as the item's title/description. Facebook's timeout already
degraded gracefully (QuickSave catches the error and falls back to hostname) — no change needed
there beyond noting it. Deployed via `npx supabase functions deploy fetch-og`.

**Known limitation (updated):** Facebook link previews will have no thumbnail/description for
the foreseeable future — this is Meta blocking the hosting IP range, not fixable short of moving
the scraper off Supabase Edge Functions (Deno Deploy) to different infra, which is a bigger call
to make later if it matters enough.

---

### Added: Google sign-in, email-based account linking & profile avatars
**Files:** `lib/supabase.ts`, `lib/auth.ts` (new), `lib/storage.ts`, `components/Avatar.tsx`,
`app/_layout.tsx`, `app/(auth)/login.tsx`, `app/(auth)/signup.tsx`, `app/account.tsx`

**Google OAuth (browser-based, PKCE).** Added "Continue with Google" to the login and signup
screens. `lib/auth.ts` `signInWithGoogle()` uses `supabase.auth.signInWithOAuth` with
`skipBrowserRedirect`, opens the URL via `WebBrowser.openAuthSessionAsync`, parses the returned
`code` with `Linking.parse`, and calls `exchangeCodeForSession`. Enabled `flowType: 'pkce'` in
`lib/supabase.ts` for the mobile code-exchange flow. The existing root-layout `onAuthStateChange`
handles the redirect + local→cloud migration, so no extra routing was needed. Apple deferred
(iOS-only; can't build on Windows yet).

**Account linking by email.** Relies on Supabase's automatic identity linking by *verified* email —
a Google sign-in attaches to an existing email/password user instead of creating a duplicate. This
is a Supabase dashboard setting, not app code. (Note: this links identities into one user; it does
not merge two separately-created accounts' data.)

**Avatars.** `Avatar.tsx` now renders an `<Image>` when `imageUrl` is set (gradient initials remain
the fallback). On sign-in, `syncProviderProfile()` copies the provider's name/photo into the
`profiles` row, but only fills blanks — never overwrites a user-set name or avatar. Manual upload via
`lib/storage.ts` `pickAndUploadAvatar()`: square crop, quality 0.6, hard-capped at 2 MB (rejects
oversize with `AvatarTooLargeError`), uploaded to the existing `media` bucket at
`${user.id}/avatar.jpg` (reused to avoid a new bucket/policy), cache-busted public URL stored on the
profile. The Account-page camera badge is now a real button wired to this.

**Forgot password.** Login screen has a "Forgot password?" link → `sendPasswordReset()`
(`resetPasswordForEmail` with a `trove://change-password` deep link). Root layout routes
`PASSWORD_RECOVERY` events to the existing change-password screen.

**Account-page cleanup.** Name edits now check the `updateProfile` result and alert on failure; the
previously dead **Email** row is now read-only (no misleading chevron); `avatar_url` is loaded from
the profile (was discarded).

**Requires out-of-app setup before it works:** Google OAuth client in Google Cloud + Supabase Google
provider config, `trove://` redirect URLs, automatic email-linking enabled, and `media` bucket RLS
allowing per-user writes (already in place for media uploads).

---

### Changed: Library header avatar — guest vs logged-in states
**File:** `app/(tabs)/index.tsx`

The top-right avatar used to render a flat accent circle with the first initial,
falling back to a literal "?" — which a guest (no profile name) always saw, looking
broken.

- **Logged in:** now reuses the gradient `components/Avatar.tsx` (terracotta→plum,
  serif initials), falling back to "T" instead of "?".
- **Guest (not logged in):** outlined neutral circle with a muted `person-outline`
  icon, signaling "tap to sign in". Tap still routes to `/account`, whose guest view
  funnels to `/(auth)/` via "Sign in or create account".
- **Reactivity:** folded the profile fetch + `isLoggedIn()` check into the existing
  `useFocusEffect`/`loadData` (removed the old mount-only `useEffect`), so the avatar
  switches between states after sign-in/out without an app restart.

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

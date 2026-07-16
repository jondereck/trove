# Trove — Dev Log

Running record of changes, fixes, and decisions. Most recent first.

---

### Multi-issue sprint — video, OCR, digest, YouTube, keyboard, toast (2026-07-16)
**Files:** `app/share.tsx`, `supabase/functions/fetch-og/index.ts`, `components/QuickSave.tsx`,
`app/save/[id].tsx`, `components/SaveVideoPlayer.tsx`, `lib/videoThumb.ts`, `lib/ocr.ts`,
`lib/digestNotifications.ts`, `lib/settings.ts`, `app/notification-settings.tsx`, `app/account.tsx`,
`app/_layout.tsx`, `app.json`, `package.json`

**Share toast:** Auto-share chest animation no longer shows a top `SaveToast` after save/duplicate/error —
animation alone is the feedback; then the share flow exits.

**YouTube OG:** `fetch-og` now uses YouTube oEmbed (same pattern as TikTok) for title, thumbnail, and
author description; HTML scrape remains the fallback. Function redeployed.

**Keyboard:** QuickSave input step is scrollable; save detail edit wraps in iOS `KeyboardAvoidingView`
so note fields stay above the IME. Android still avoids `behavior="height"` (flicker).

**Video playback:** Added `expo-video`. Gallery videos generate a still via `generateThumbnailsAsync`
→ `image_url`; detail screen plays in-app with native controls (`SaveVideoPlayer`).

**OCR (low cost):** On-device ML Kit (`@infinitered/react-native-mlkit-text-recognition`) extracts text
from images (or the video still). Text feeds existing `suggestForSave` / `suggestNoteTitle` — no
Vision API. Skips silently on web / empty / failure.

**Inbox digest:** Local notifications via `expo-notifications`. Account → Notifications: enable,
daily/weekly, hour, weekday. Skips schedule when inbox count is 0. Tap opens Inbox. Resyncs on
foreground and after saves.

**Native:** Requires rebuild after `expo prebuild` (`npx expo run:android`).

---

### Default — Review when sharing off (2026-07-13)
**Files:** `lib/settings.ts`

`shareReviewModal` default is now `false` so OS shares auto-save to Unsorted (chest
loader) instead of opening QuickSave. Users who already toggled it on keep their value.

---

### Fix QuickSave — link save failures + note flicker (2026-07-13)
**Files:** `components/QuickSave.tsx`, `app/(tabs)/_layout.tsx`, `app/share.tsx`,
`lib/cloudDb.ts`, `lib/shareSave.ts`, `components/AIOrganize.tsx`

**Could not save link:** QuickSave called `onSave` then immediately `onClose`. On the share
route that exits the app (`BackHandler.exitApp`) before the insert finished. Cloud inserts
also failed hard when `is_viewed` wasn’t migrated yet, and returned `null` without the UI
checking. Fixes: await `onSave` before closing (with a saving spinner); retry insert without
`is_viewed` if the column is missing; use session `getUserId()` as a fallback; treat a null
save as an error so the modal stays open.

**Note flicker:** Android `KeyboardAvoidingView behavior="height"` double-resized with the
system IME while typing multiline notes. Disabled KAV on Android; split note vs link into
separate `TextInput`s so toggling `multiline` doesn’t thrash layout.

---

### Fix Inbox crash — `COLORS` undefined in themed styles (2026-07-13)
**Files:** `app/(tabs)/inbox.tsx`

Inbox crashed on mount with `ReferenceError: Property 'COLORS' doesn't exist`.
`createStyles` takes the theme palette as `c`, but `badgeMuted` still referenced
global `COLORS` (removed during dark-mode theming). Switched to `c.muted`.

---

### Chest loader — illustrated chest + RN Animated (2026-07-13)
**Files:** `components/ChestLoaderVisual.tsx`, `components/ShareSaveAnimation.tsx`,
`assets/chest/chest-closed.png`, `assets/chest/chest-open.png`,
`lib/chestLoaderTimeline.test.ts`, `assets/lottie/chest-save.json` (deleted),
`package.json` (removed `lottie-react-native`),
`docs/superpowers/plans/2026-07-13-chest-loader-working-animation.md`

Replaced the Lottie loader with a premium illustrated chest driven by RN `Animated`.
Two generated PNGs (closed + open, transparent, matched to the storyboard art) are
crossfaded to open/close the lid; the link card, soft glow, gold sparkles, and green
success check are `Animated` Views. Everything derives from a single `progress` value
(0→1 per 3.2s cycle) via `interpolate`. `ShareSaveAnimation` drives that progress with
one linear `Animated.timing` and keeps the exact phase machine, fade, 800ms success
hold, and `onFinished` contract — `app/share.tsx` unchanged. **Why:** hand-authored
Lottie JSON broke twice on Android (detached layers from lost `parent` links). Image +
transform interpolations render identically on every device, look premium, and are
reviewable in a normal diff. Deleted `chest-save.json`, dropped `lottie-react-native`,
removed the obsolete Lottie-topology test. `npm run test:timeline` green (6 tests).
Native rebuild needed (native dep removed): `npx expo prebuild --no-install` then
`npx expo run:android`.

---

### Plan — guaranteed-working chest loader animation (2026-07-13)
**Files:** `docs/superpowers/plans/2026-07-13-chest-loader-working-animation.md`

Instruction plan to make the auto-share saving animation render reliably on device.
Task 0 verifies the merged Lottie parenting fix after a clean reinstall; if it still
fails (or looks off), Path B replaces only the visual with a code-drawn RN `Animated`
chest (`ChestLoaderVisual`) driven by one progress value — timeline module, phase
machine, and `share.tsx` wiring stay untouched.

---

### Chest loader — restore detached chest layers (2026-07-13)
**Files:** `assets/lottie/chest-save.json`, `lib/chestLoaderTimeline.test.ts`

Restored the Lottie `lid` and `body` parent links to `chestRoot`, fixing the Android
render where only detached layer fragments appeared. Added a regression test that
asserts both parent relationships.

---

### Merge — cloud-first auth + settings/plan + chest loader (2026-07-13)
**Files:** merge resolution across `account`, `plan`, share animation, `DEVLOG`, deps

Combined local cloud-first auth / soft Cloud verify with origin Settings→Plan screen,
chest loader timeline, and unread-save polish. Kept guest “Already have Cloud? Sign in”
and post-Cloud account prompt; Plan CTA uses `requestAuthFlow` + auth gate.

---

### Soft Cloud verify after sign-in (2026-07-12)
**Files:** `lib/authNavigation.ts`, `app/_layout.tsx`, `app/(auth)/index.tsx`,
`app/(auth)/login.tsx`

Level A verification for the returning-user door: `requestAuthFlow()` marks
`cloudVerifyPending`. After `SIGNED_IN` + `logInPurchases`, if still `!hasCloud()`,
show an alert (OK / Restore / See plans). Does not auto sign-out. Flag is consumed
once so cold-start session restore does not nag. Welcome Sign in now calls
`requestAuthFlow()` so AuthLayout allows the screen and verify can run.

---

### Cloud-first auth gate (2026-07-12)
**Files:** `lib/authGate.ts`, `lib/entitlements.ts`, `app/(auth)/index.tsx`,
`app/(auth)/login.tsx`, `app/(auth)/signup.tsx`, `app/account.tsx`, `app/upgrade.tsx`,
`docs/superpowers/specs/2026-07-12-cloud-first-auth-design.md`,
`docs/superpowers/plans/2026-07-12-cloud-first-auth.md`

Purchase-first account model: Free/Unlocked no longer get a generic Create account path.
Welcome primary is **Sign in**; secondary **Get Trove Cloud**. Guest Account shows
**Already have Cloud? Sign in** + **Get Trove Cloud**, plus a sync CTA when Cloud is
active but still guest. After Cloud purchase/restore while guest, `showCloudAccountPrompt`
offers Create account / Sign in / Not now. Signup mounts only when `hasCloud()`; otherwise
redirects to Upgrade. Login footer links to Cloud plans when signup is gated.
`applyCustomerInfo` updates the tier cache immediately after purchase so signup isn't
blocked by a stale Free tier.

---

### Dark mode — full app theming (2026-07-12)
**Files:** All tab screens, account/detail flows, modals (`QuickSave`, `AIOrganize`,
`CollectionForm`), `Settings`, `SaveCard`, auth, onboarding, upgrade, toasts, etc.

Most screens still imported static `COLORS` / `LIGHT_COLORS`, which always resolved to the light
palette even when Appearance → Dark was selected. Migrated every screen and shared component to
`useColors()` / `useThemedStyles(createStyles)` so backgrounds, cards, borders, and text follow
`DARK_COLORS` from `ThemeContext`. Hardcoded light chip fills (`#fdf0eb`) → `accentSoft`.
`Settings` toggle track and chevron colors are scheme-aware.

---

### Onboarding — AI slide + no-account icon fix (2026-07-12)
**Files:** `app/onboarding.tsx`

Added a fourth onboarding slide for AI features (save suggestions + Inbox AI Organize) with the
`sparkles` icon. Moved `sparkles` off the "No account needed" slide — it was the wrong metaphor
and could render inconsistently — and replaced it with `phone-portrait-outline` (local/on-device).

---

### App icon — use exact approved art (2026-07-12)
**Files:** `assets/icon-approved.png`, `assets/icon.png`, `assets/splash-icon.png`,
`assets/favicon.png`, `assets/android-icon-*.png`, `scripts/render-icons.mjs`, `app.json`

SVG recreation looked off on device. Switched to the user-approved PNG as source of truth.
Flattened baked-in black squircle corners to orange so BrandLogo / launcher don't show
dark frames. Adaptive bg `#c65830` matches the art. Re-run: `node scripts/render-icons.mjs`.

---

**Files:** `assets/icon-source.svg`, `assets/icon-foreground.svg`, `assets/icon-monochrome.svg`,
`assets/icon.png`, `assets/splash-icon.png`, `assets/favicon.png`,
`assets/android-icon-*.png`, `app/(auth)/index.tsx`, `app/(auth)/login.tsx`,
`app/(auth)/signup.tsx`, `scripts/render-icons.mjs`

App icon refined to match approved design (cream T, lid seam + latch + classic keyhole
cutouts on `#c0613c`). Same asset shown via `BrandLogo` on welcome, login, and signup
(larger sizes). Rebuild native app to see launcher icon change.

---

**Files:** `app/_layout.tsx`

Guest users tapping "Sign in or create account" on Account were immediately sent back to
Library: root navigator redirected all `(auth)` routes to tabs without checking
`isAuthFlowRequested()`. Now auth stays open when opened intentionally from settings.

---

### Settings & plan UX cleanup (2026-07-12)
**Files:** `app/account.tsx`, `app/plan.tsx`, `app/_layout.tsx`, `app/ai-preferences.tsx`,
`app/appearance.tsx`, `app/change-password.tsx`, `app/(tabs)/index.tsx`

**Settings screen:** Top bar title renamed from Account → Settings; sub-screen back links match.

**Removed upsells from settings:** Dropped the gradient Unlock Trove / Get Trove Cloud banner and
the guest "Sign in or create account" row from the Account settings group.

**Clickable plan stat:** Plan column in the profile stats row opens a new Your plan screen with
current tier, included features, and usage meters (saves / collections / AI) on the free plan.

**Upgrade funnel:** Free guests tap Plan → "Create an account to sync" → Trove plans (`/upgrade`)
where Restore purchases lives for returning subscribers. Logged-in users see "See Trove plans" or
"Get Trove Cloud" instead.

---

### Chest loader — 6-scene storyboard implementation (2026-07-12)
**Files:** `lib/chestLoaderTimeline.ts`, `lib/chestLoaderTimeline.test.ts`,
`assets/lottie/chest-save.json`, `components/ShareSaveAnimation.tsx`, `app/share.tsx`,
`package.json`

Implemented the auto-share chest loader to the 6-scene storyboard (prepare → drop-in →
organize → close → finalize → green check) at 3.2s / 60fps. Scene copy is driven by
`chestLoaderTimeline.resolveLoaderPhase`. While the network save is still in flight the
cycle loops (check fades before restart). On `saved` it finishes the current cycle, freezes
on the peak check frame for 800ms, then fades out before the snackbar. Duplicate/error
fades out immediately. Spec/plan:
`docs/superpowers/specs/2026-07-12-trove-chest-loader.md`,
`docs/superpowers/plans/2026-07-12-trove-chest-loader.md`.

---

### Unread saves clarity (2026-07-12)
**Files:** `components/SaveCard.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/inbox.tsx`,
`app/(tabs)/_layout.tsx`, `types/index.ts`, `lib/db.ts`, `lib/localDb.ts`, `lib/cloudDb.ts`

**Stronger unread visuals:** Unread cards use `accentSoft` background, accent border, 4px left
stripe, larger dot, bold title, and a `NEW` pill badge.

**Unread filter:** Library filter chip filters `is_viewed === false` (local + cloud).

**Mark read on link open:** Tapping a link thumbnail / hero image marks the save viewed without
opening the detail screen.

**Unsorted counts:** Inbox header shows `N new` for unread items; tab bar badge on Unsorted when
inbox has unread saves.

**Cloud createSave:** Explicitly sets `is_viewed: false` on insert.

---

### Plan — 6-scene chest loader storyboard (2026-07-12)
**Files:** `docs/superpowers/specs/2026-07-12-trove-chest-loader.md`,
`docs/superpowers/plans/2026-07-12-trove-chest-loader.md`

Locked the auto-share saving-loader storyboard (3.2s / 60fps, six scenes, loop + 800ms
success hold) and wrote a task-by-task implementation plan: pure `chestLoaderTimeline`
phase machine, rebuilt Lottie with fading green check, `ShareSaveAnimation` orchestrator,
and `app/share.tsx` completion wiring. Prefer this refined plan over the earlier draft in
`docs/superpowers/plans/2026-07-12-chest-loader-animation.md`.

---

### Chest loader storyboard — earlier draft plan (2026-07-12)
**Files:** `docs/superpowers/specs/2026-07-12-trove-chest-loader-spec.md`,
`docs/superpowers/plans/2026-07-12-chest-loader-animation.md`

Earlier draft of the same feature (30fps Lottie). Superseded by the refined 60fps plan above.

---

### App icon — flat T-chest with keyhole (2026-07-11)
**Files:** `assets/icon-source.svg`, `assets/icon-foreground.svg`, `assets/icon-monochrome.svg`,
`assets/icon.png`, `assets/splash-icon.png`, `assets/favicon.png`,
`assets/android-icon-foreground.png`, `assets/android-icon-background.png`,
`assets/android-icon-monochrome.png`, `scripts/render-icons.mjs`, `app.json`

Replaced 3D clay chest icon with flat minimal **T-shaped chest**: cream `#fdf6ef` letter T on
burnt-orange `#c0613c` background, lid seam + latch, keyhole cutout. Android adaptive icon
background updated to match. Re-render anytime with `node scripts/render-icons.mjs`.

---

### Appearance, unread saves, move picker, AI hints (2026-07-11)
**Files:** `app/appearance.tsx`, `app/account.tsx`, `app/ai-preferences.tsx`, `app/_layout.tsx`,
`app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/inbox.tsx`,
`app/(tabs)/collections.tsx`, `app/collection/[id].tsx`, `app/save/[id].tsx`,
`components/MoveToCollectionModal.tsx`, `components/SaveCard.tsx`, `components/Settings.tsx`,
`constants/theme.ts`, `constants/pinLimits.ts`, `contexts/ThemeContext.tsx`,
`lib/settings.ts`, `lib/localDb.ts`, `types/index.ts`, `supabase/add-viewed.sql`

**Appearance:** System / Light / Dark theme picker under Account → Appearance.
`ThemeProvider` resolves palette; tab bar and root `StatusBar` follow the active scheme.

**Unread saves:** `is_viewed` on saves — new saves start unread; opening detail marks read.
Unread cards show an accent dot, bold title, and left border.

**Move to collection:** Picker has “Create new collection”; pinned collections (max 3) stay
at the top with a section label. Collection detail uses the shared modal.

**Pin limit:** Max 3 pinned collections enforced on Collections grid and collection detail.

**Thumbnail → link:** Tapping a link-card hero image or list thumbnail opens the URL.

**AI preferences:** Long footer paragraphs replaced with short per-toggle hints.

---

### Library greeting polish (2026-07-11)
**Files:** `app/(tabs)/index.tsx`

Greeting shows first name only; evening greeting used from 5pm onward (no "Good night").

---

### Library perf, organize fixes, pin, move, UI polish (2026-07-11)
**Files:** `app/(tabs)/index.tsx`, `app/(tabs)/inbox.tsx`, `app/(tabs)/collections.tsx`,
`app/collection/[id].tsx`, `app/_layout.tsx`, `components/AIOrganize.tsx`,
`components/SaveCard.tsx`, `components/MoveToCollectionModal.tsx`, `constants/organize.ts`,
`lib/ai.ts`, `lib/localDb.ts`, `lib/cloudDb.ts`, `lib/organize.ts`, `types/index.ts`,
`supabase/add-pinned.sql`

**Library lag:** Kept `ScrollView` + masonry two-column grid (left/right split).
Pagination still loads in batches on scroll — the virtualized `FlatList` experiment
was reverted because it broke the card layout.

**Move saves:** Library selection bar now has Move (same sheet as Unsorted/Collection detail)
via shared `MoveToCollectionModal`.

**AI Organize limit:** Only the first 10 unsorted items go to AI per run
(`ORGANIZE_BATCH_LIMIT`); banner/CTA copy reflects remaining count.

**AI suggestions fix:** Stale `decisions` closure bug fixed with a ref; collection picker
shows existing collections + “+ New”; AI collection names matched to existing collections;
tags empty-state hint when none suggested.

**AI Organize live apply + session cache:** Accept applies each save immediately (removed
from Unsorted right away). In-memory `organizeSession` caches AI results for the app
session — dismissing the sheet and reopening resumes without a new AI call; only new
save ids trigger analysis. Cache clears when the app process exits.

**Pin:** `is_pinned` on saves + collections (local + cloud SQL migration). Pin button on
save cards, collection cards, and collection detail header. Pinned items sort to top.
Cloud `cloudDb.ts` probes for pin columns and falls back gracefully until
`supabase/add-pinned.sql` is run.

**UI:** Library top-right avatar → settings icon; greeting uses first + last name once profile
loads (no “there” flash); logged-in users skip onboarding/auth intro routes on cold start.
Account screen uses in-memory `profileCache` (filled by Library) so settings opens with
the real name — no “Trove” / “T” avatar flash while profile loads.

---

### Lottie chest loader for auto-share (2026-07-11)
**Files:** `components/ShareSaveAnimation.tsx`, `assets/lottie/chest-save.json`, `package.json`

Upgraded the auto-share save loader from hand-built `Animated` Views to a Lottie animation
(`lottie-react-native` ~7.3.4, Expo SDK 56 compatible). The animation (`assets/lottie/chest-save.json`,
custom-authored vector, 96 frames @ 30fps, loops) shows a link card dropping into a treasure chest:
lid opens, card falls in, lid snaps shut with a squash-and-stretch bounce, sparkles pop, ambient
glow pulses — all in Trove brand colors (accent `#c0613c`, cream, warm neutrals). Component keeps
the same `active` prop + `MIN_DISPLAY_MS` export, adds an animated ellipsis on "Stashing your
link…". Native module — requires `npx expo run:android` rebuild.

---

### Chest save animation for auto-share (2026-07-11)
**Files:** `components/ShareSaveAnimation.tsx`, `app/share.tsx`

When **Review when sharing** is off, the blank share screen is replaced with a Trove-themed
loading animation: a link chip drops into a treasure chest, the chest bounces and glows, then a
sparkle plays before the existing snackbar. Minimum display time 900ms so fast saves don't flash.
Pure React Native `Animated` — no new dependencies. QuickSave review path unchanged.

---

### Share review toggle — auto-save to Unsorted (2026-07-11)
**Files:** `lib/settings.ts`, `lib/shareSave.ts`, `app/share.tsx`, `app/ai-preferences.tsx`

New setting **Review when sharing** (`shareReviewModal`, default on) in AI preferences → Sharing.
When **on**, OS shares open the QuickSave preview with AI suggestions (unchanged). When **off**,
shared links save straight to Unsorted with a snackbar (`Saved to Unsorted`, `Already in Trove`, or
an error), then return to the source app. OG metadata still fetched in the background. In-app `+`
Quick Save is unaffected.

---

### Library pagination — UI + DB (2026-07-11)
**Files:** `constants/library.ts`, `types/index.ts`, `lib/cloudDb.ts`, `lib/localDb.ts`,
`lib/db.ts`, `app/(tabs)/index.tsx`

**What:** Library no longer loads/renders all saves at once. Initial batch is 24 items;
scrolling near the bottom loads 20 more. Filter chips (All, Favorites, Links, etc.) now
query server-side via `fetchLibrarySavesPage` — Supabase uses `.range()` + `count: 'exact'`;
local mode slices the in-memory cache. Header "X SAVED" uses `fetchLibraryCount()` for the
full library total regardless of active filter.

---

### Share modal flow + Inbox → Unsorted rename (2026-07-11)
**Files:** `lib/shareIntent.ts`, `constants/labels.ts`, `app/share.tsx`, `app/_layout.tsx`,
`app/(tabs)/_layout.tsx`, `app/(tabs)/inbox.tsx`, `components/QuickSave.tsx`,
`components/AIOrganize.tsx`, `app/ai-preferences.tsx`, `lib/ai.ts`

**Share modal:** OS share intents (Facebook, Chrome, etc.) now route to a dedicated `/share`
screen instead of opening the full app with tab bar. QuickSave modal opens immediately with the
shared URL (fetch metadata + AI suggest preview). On save or dismiss, the app exits on Android
(`BackHandler.exitApp()`) to return to the source app. Share handling removed from tabs layout;
centered `+` QuickSave unchanged.

**Unsorted rename:** All user-facing "Inbox" labels renamed to "Unsorted" (tab, screen title,
QuickSave chips/buttons, AI Organize, AI preferences copy). Route file (`inbox.tsx`) and DB
field (`is_inbox`) unchanged for backward compatibility. Single source of truth:
`constants/labels.ts` → `UNSORTED_LABEL`.

**Fix — stale share modal on reopen:** After share+exit, Android keeps the app process alive on
the `/share` route with QuickSave state in memory. Reopening Trove from the launcher showed the
modal again. `finishShare` now clears state, resets the intent, and `router.replace('/(tabs)')`
before exit; `RootNavigator` redirects off `/share` when `!hasShareIntent`; share screen returns
null unless a live share intent is active.

---

### Cloud dev environment setup: web-preview deps (2026-07-11)
**Files:** `package.json`, `package-lock.json`, `AGENTS.md`

Added the Expo web-preview dependencies (`react-dom`, `react-native-web`, `@expo/metro-runtime`
via `npx expo install`) so `npx expo start --web` runs in headless environments (e.g. Cursor
Cloud) where native Android/iOS builds aren't possible (no KVM / no macOS). No product code
changed. Documented cloud setup notes in `AGENTS.md` under "Cursor Cloud specific instructions":
install with `npm install --legacy-peer-deps`, create a `.env.local` (placeholder Supabase values
are enough for guest/local mode), and the web-only `expo-secure-store` crash caveat in
`lib/supabase.ts` (needs a `Platform.OS === 'web'` localStorage fallback to preview on web).

---

### Freemium tiers + RevenueCat billing (2026-07-11)
**Files:** `constants/limits.ts`, `lib/entitlements.ts`, `lib/aiUsage.ts`, `lib/upgradeAlert.ts`,
`lib/db.ts`, `lib/ai.ts`, `lib/storage.ts`, `lib/transfer.ts`, `lib/raindropImport.ts`,
`lib/organize.ts`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`,
`app/(tabs)/inbox.tsx`, `app/(tabs)/collections.tsx`, `app/account.tsx`, `app/upgrade.tsx`,
`components/CollectionForm.tsx`, `supabase/limits.sql`, `supabase/functions/ai-proxy/index.ts`,
`supabase/functions/rc-webhook/index.ts`, `docs/monetization-setup.md`

Three tiers: **Free** (100 saves, 5 collections, 50-item import, 25 AI/mo),
**Unlocked** ₱200 one-time (`trove_unlocked` — unlimited local, 300 AI/mo fair-use),
**Cloud** ₱150/mo or ₱1,200/yr (`trove_cloud_monthly`/`_yearly` — sync, cloud media,
1,000 AI/mo). Export stays unlimited on every tier.

- `lib/entitlements.ts` mirrors the session.ts pattern: sync-readable `getTier()`
  hydrated from `react-native-purchases`, plus a stable SecureStore `installId`.
  Dev override: `EXPO_PUBLIC_FORCE_TIER`. SDK key: `EXPO_PUBLIC_REVENUECAT_ANDROID`.
- **Sync is now gated on the Cloud entitlement**: `db.ts` `pick()` requires
  `isLoggedIn() && hasCloud()` (profile still follows plain login), same for media
  upload in `storage.ts`. Local→cloud migration runs on gaining the `cloud`
  entitlement, not on sign-in.
- Caps throw a typed `LimitReachedError` from `db.ts`; QuickSave/share-intent/
  collection forms/AI-organize/import all catch it and show an upgrade prompt
  (`lib/upgradeAlert.ts` → `/upgrade` paywall screen).
- AI metering is two-layer: client counter (`lib/aiUsage.ts`, soft) and the
  ai-proxy (authoritative) which resolves tier from the new `entitlements` table,
  counts per-month in `ai_usage` (atomic `increment_ai_usage` RPC), and returns
  429 at the cap. `rc-webhook` keeps `entitlements` in sync from RevenueCat
  webhook events (fetches subscriber info from the RC REST API for truth).
- New paywall `app/upgrade.tsx` (plan cards, monthly/yearly toggle, restore
  purchases); Account banner now routes there and the Plan stat shows the tier.
- **Run `supabase/limits.sql` once**, redeploy `ai-proxy`, deploy `rc-webhook`,
  set `RC_WEBHOOK_SECRET` + `RC_API_KEY`. Play Console + RevenueCat dashboard
  steps documented in `docs/monetization-setup.md`.
- Native dep added (`react-native-purchases`): run `npx expo prebuild --no-install`
  and rebuild the dev client. Purchases only testable from a Play internal-testing
  build; use the force-tier env until then.
- Also fixed a pre-existing TS error in `components/BrandLogo.tsx` (ImageStyle).

---

### Added: AI preference toggle for title and description (2026-07-11)
**Files:** `lib/settings.ts`, `app/ai-preferences.tsx`, `lib/ai.ts`, `components/QuickSave.tsx`

Added missing **Suggest title and description** toggle under Account → AI preferences.
Controls AI title suggestions for notes in QuickSave (including the ✨ re-suggest button).
When off, notes use the first 60 characters as the title instead of calling the model.
Link title/description still come from page metadata (`fetch-og`); this toggle only gates AI.

---
**Files:** `assets/icon.png`, `assets/android-icon-*.png`, `assets/favicon.png`,
`assets/splash-icon.png`, `constants/branding.ts`, `components/BrandLogo.tsx`,
`app/(auth)/index.tsx`, `app/(auth)/login.tsx`, `app/(auth)/signup.tsx`, `app.json`,
`docs/store-listings.md`

Locked production branding for store release:
- **Display name:** Trove: Save Anything
- **Tagline:** Save anything (unified across welcome, login, signup)
- **Icon:** Warm open treasure chest in burnt orange (`#c0613c`) on `#faf9f5` background —
  literal "trove" metaphor with saved link/note cards inside
- Android adaptive icon background changed from generic blue to warm off-white
- `BRAND` constants + `BrandLogo` component replace scattered copy and ✦ placeholders
- Store listing copy drafted in `docs/store-listings.md`

Rebuild required after icon change: `npx expo prebuild --no-install` then `npx expo run:android`.

---

### Smarter keyword search (2026-07-11)
**Files:** `supabase/search-upgrade.sql`, `lib/cloudDb.ts`, `lib/localDb.ts`, `lib/db.ts`,
`app/(tabs)/search.tsx`

Search now requires every word to match (AND across terms) and ranks results by relevance
(title 4 > tags 3 > description/content 2 > url 1 per term, newest breaks ties). URLs and
partial tags are searchable, and collection names/descriptions match too (shown as chips
above results). Cloud search runs through a new `search_saves` Postgres function —
**run `supabase/search-upgrade.sql` once in the Supabase SQL Editor**; until then the app
falls back to the old ilike query (now with sanitized input). Local search mirrors the same
scoring in memory. Search screen: type filter chips are now rendered, plus a loading
spinner, a no-results state, and opening a result records the recent search.

---

### Inbox multi-select + move (2026-07-11)
**Files:** `app/(tabs)/inbox.tsx`

Long-press an Inbox card to enter multi-select (same pattern as Library / collection
detail). Selection bar supports Move to a collection and Delete. Swipe-to-archive is
disabled while selecting so taps toggle selection cleanly.

---

### Hide sign-in on first-launch onboarding (2026-07-11)
**Files:** `app/onboarding.tsx`

Removed the “I already have an account · Sign in” link from the intro splash.
First install stays guest-first (Skip / Get started only); sign-in remains available
from Account after entering the app.

---

### Raindrop CSV import (2026-07-11)
**Files:** `lib/raindropImport.ts`, `lib/transfer.ts`, `app/account.tsx`

Account → Import data now accepts Raindrop.io CSV exports alongside Trove zip/JSON
backups. Format is auto-detected from CSV headers (`url`, `title`, `folder`, `created`).
`Unsorted` folders land in Inbox; named folders become collections (matched by name).
Covers stay as remote URLs; favorites, tags, notes, excerpts, and created dates map across.
URL dedup skips already-saved links on re-import.

---

### Collection edit + custom cover thumbnail (2026-07-11)
**Files:** `types/index.ts`, `lib/cloudDb.ts`, `lib/localDb.ts`, `lib/storage.ts`,
`components/CollectionForm.tsx`, `app/collection/[id].tsx`, `supabase/add-collection-cover.sql`

Collections can be edited from the detail screen (pencil icon): name, icon, color, description, and
an optional cover image. Custom covers are stored as `cover_image_url` and lead the Collections-tab
collage; clearing the cover falls back to the 3 most recent save thumbnails. Guest covers save to
local media; signed-in covers upload to Storage. Run `add-collection-cover.sql` in Supabase once.

---

### Collection delete (empty only) (2026-07-11)
**Files:** `app/collection/[id].tsx`, `app/(tabs)/collections.tsx`

Empty collections can be deleted from the collection detail header (trash icon). On the Collections
tab, long-press enters multi-select (like Library); tap more cards, then trash to bulk-delete.
Non-empty collections are blocked with a warning and skipped in bulk delete.

---

### Library greeting, avatar initials, grid/list toggle (2026-07-11)
**Files:** `app/(tabs)/index.tsx`, `components/Avatar.tsx`, `components/SaveCard.tsx`, `lib/settings.ts`

**Greeting:** Combined into one line (`Good afternoon, John.`) so it no longer wraps across two rows.

**Avatar:** Library header passes first + last name (guest or signed-in) so initials show both letters (e.g. `JD`).

**View toggle:** Grid/list button beside filter chips; preference persisted in settings as `libraryView`. List mode uses a compact horizontal row layout on `SaveCard`. Chip row uses explicit `marginRight` + bar `gap` so spacing stays even (RN horizontal ScrollView ignores `gap`).

---

### Fixed: Account profile save, misleading default collection, save delete icon (2026-07-11)
**Files:** `lib/cloudDb.ts`, `lib/localDb.ts`, `app/account.tsx`, `app/save/[id].tsx`, `app/ai-preferences.tsx`

**Profile save:** Cloud `updateProfile` now upserts the `profiles` row so first-time edits on older
accounts actually persist (plain `update` silently matched zero rows). Guest users can also edit their
display name — stored locally in AsyncStorage via `localDb.fetchProfile` / `updateProfile`. Account
reloads profile on focus and after tapping Done.

**Default collection row:** Removed the dead "Default collection: Read Later" setting from Account.
"Read Later" is an AI label for Inbox, not a real collection. Clarified in AI preferences explainer.

**Save detail delete:** Replaced the 🗑 emoji with `Ionicons trash-outline` to match the rest of the app.

---

### Fixed: share-to-Inbox, realtime refresh, auth flash, collection flicker, TikTok previews (2026-07-11)
**Files:** `lib/dataEvents.ts`, `lib/db.ts`, `app/(tabs)/_layout.tsx`, `components/SaveToast.tsx`,
`app/(tabs)/index.tsx`, `app/(tabs)/inbox.tsx`, `app/(tabs)/collections.tsx`, `lib/authNavigation.ts`,
`app/(auth)/_layout.tsx`, `app/(auth)/login.tsx`, `app/_layout.tsx`, `app/onboarding.tsx`,
`app/account.tsx`, `supabase/functions/fetch-og/index.ts`

**Realtime refresh:** Added a lightweight mutation bus (`lib/dataEvents.ts`). `lib/db.ts` now emits
`saves` / `collections` events after successful create, update, and delete. Library, Inbox, and
Collections subscribe so new saves appear immediately without pull-to-refresh or tab switching.

**Share-to-Inbox:** OS share intents (Savebook, Chrome, etc.) no longer open QuickSave. A shared URL is
deduped, saved straight to Inbox with a minimal title, and a top snackbar confirms the result
(`Saved to Inbox`, `Already in Trove`, or an error). OG metadata is fetched in the background and
patched onto the same save. The centered `+` QuickSave flow is unchanged.

**Collection form flicker:** Stabilized the create sheet — animation values reset before open, keyboard
focus deferred until the spring finishes, Android `KeyboardAvoidingView` no longer uses `height`, error
row has reserved space, and list refresh waits until the sheet closes.

**Auth startup:** Login no longer flashes on cold start when already signed in or when nav state
restores an auth route. `lib/authNavigation.ts` marks user-initiated auth entry; `(auth)/_layout`
redirects to tabs unless that flag is set. Splash stays up until fonts + session + local-data check
resolve. Login screen has a top-right **Skip** that returns to the app as guest.

**Settings cleanup:** Removed duplicate **Auto-organize new saves** toggle from Account; AI Preferences
remains the single control.

**TikTok previews:** `fetch-og` now tries TikTok's official oEmbed API first (`thumbnail_url`, title,
author), with the existing HTML/JSON-LD scraper as fallback. Deployed as **fetch-og v7**
(`--no-verify-jwt`, same as prior deploys).

**Verification:**
- `npx tsc --noEmit` — pass
- `npx expo-doctor` — 3 pre-existing failures (not addressed here): missing `react-native-screens`
  peer for `@react-navigation/bottom-tabs`, direct `@react-navigation/bottom-tabs` alongside
  expo-router SDK 56, and 8 patch-version mismatches on Expo packages
- `npx expo run:android` — failed in Cursor due to Windows path length >260 in sandbox Gradle cache;
  device `R58R21QKH3D` already has Trove installed — manual share/auth/collection tests pending a
  local-terminal rebuild

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

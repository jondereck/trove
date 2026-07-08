@AGENTS.md

# Trove — Claude Code Instructions

## Dev Log
All changes, bug fixes, and decisions are tracked in `DEVLOG.md` at the project root.
**Always update `DEVLOG.md`** when making any fix or adding any feature — add a new dated entry at the top.

## What this app is
Trove is a personal curation app — a beautiful place to save links, notes, images, and videos. Think of it as a private, organized "second brain" with AI-assisted organization. Built with Expo SDK 56 + React Native + Supabase.

## Tech stack
- **Framework:** Expo SDK 56, React Native, TypeScript (strict)
- **Routing:** expo-router (file-based, `app/` directory)
- **Backend:** Supabase (Postgres + Auth + Edge Functions)
- **Auth storage:** expo-secure-store via `ExpoSecureStoreAdapter` in `lib/supabase.ts`
- **Fonts:** Instrument Serif (display) + Hanken Grotesk (sans) via `@expo-google-fonts`
- **Icons:** `@expo/vector-icons` (Ionicons)
- **Share integration:** `expo-share-intent` v6.1.1 — Android ACTION_SEND + iOS Share Extension

## Design system — match this exactly
| Token | Value |
|-------|-------|
| Accent | `#c0613c` (burnt orange) |
| Background | `#faf9f5` (warm off-white) |
| Cream | `#fdf6ef` |
| Card | `#ffffff` |
| Border | `#e8e6e0` |
| Text | `#1a1a1a` |
| Muted | `#999999` |

All tokens live in `constants/theme.ts` — always import from there, never hardcode colors.

Display font (headings, titles, wordmark): `FONTS.serif` = `InstrumentSerif_400Regular`
Body font: `FONTS.sans` = `HankenGrotesk_400Regular` and variants

## File structure
```
app/
  _layout.tsx          ← root layout, font loading, SafeAreaProvider
  (tabs)/
    _layout.tsx        ← custom tab bar with centered + QuickSave button
    index.tsx          ← Library (masonry grid of all saves)
    collections.tsx    ← Collections (grouped folders)
    search.tsx         ← Search (full-text)
    inbox.tsx          ← Inbox (unsorted saves tray + AI Organize)
components/
  SaveCard.tsx         ← card for link/image/video/note (4 variants)
  QuickSave.tsx        ← bottom sheet modal to save a URL or note
  AIOrganize.tsx       ← AI organize flow (analyzing → suggestions → apply)
constants/
  theme.ts             ← COLORS, FONTS, RADIUS, SPACING
lib/
  supabase.ts          ← Supabase client with SecureStore adapter
  ai.ts                ← AI calls (direct OpenAI in dev, ai-proxy Edge Function in prod)
  db.ts                ← data router → cloudDb.ts (signed in) / localDb.ts (signed out)
  storage.ts           ← media upload (Supabase Storage / local FS) + size limits
  transfer.ts          ← zip backup export/import (v2) with bundled local media
  thumbnailRepair.ts   ← re-fetch missing link thumbnails (throttled)
types/
  index.ts             ← Save, Collection, OrganizeSuggestion interfaces
```

## Key architectural decisions
- `package.json` main = `expo-router/entry` (not `index.ts`)
- `tsconfig.json` overrides `customConditions: []` — required because TS 6 bundler resolution breaks on RN packages that lack an `exports` field (react-native-safe-area-context, etc.)
- npm installs use `--legacy-peer-deps` due to a react@19.2.3 vs 19.2.7 conflict from expo-router's web deps
- AI calls: if `EXPO_PUBLIC_OPENAI_API_KEY` is set (dev only) `lib/ai.ts` hits OpenAI directly; otherwise all users route through the `ai-proxy` Edge Function (key stays server-side). Release builds must NOT set the public key.
- All screens use real data via `lib/db.ts` (local AsyncStorage when signed out, Supabase when signed in)
- Share intent: `ShareIntentProvider` wraps the root layout; `useShareIntentContext` in `(tabs)/_layout.tsx` opens QuickSave with `initialUrl` when a URL is shared from Chrome/Safari
- `expo-share-intent` requires a **dev build** (not Expo Go) — run `npx expo run:android` or `npx expo run:ios` after prebuild
- iOS native project (`/ios`) must be generated on macOS; on Windows only Android (`/android`) is produced by prebuild

## Supabase schema
```sql
-- collections table
create table collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null, icon text default 'folder-outline',
  color text default '#c0613c', description text,
  created_at timestamptz default now()
);
-- saves table
create table saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  url text, title text not null, description text,
  type text check (type in ('link','image','video','note')) default 'link',
  content text, image_url text,
  collection_id uuid references collections(id) on delete set null,
  tags text[] default '{}', is_inbox boolean default true,
  created_at timestamptz default now()
);
alter table saves enable row level security;
alter table collections enable row level security;
create policy "own saves" on saves for all using (auth.uid() = user_id);
create policy "own collections" on collections for all using (auth.uid() = user_id);
```

Environment variables go in `.env.local`:
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

## What's still TODO
- [x] Replace `MOCK_SAVES` / `MOCK_COLLECTIONS` with real Supabase queries — via `lib/db.ts`
- [x] Auth flow (login/signup screens + session handling)
- [x] `app/collection/[id].tsx` — drill-down screen for a single collection
- [x] `app/save/[id].tsx` — save detail/edit screen
- [x] Create / edit / delete collections — `components/CollectionForm.tsx`
- [x] Supabase Edge Function for AI (`supabase/functions/ai-proxy`) — deployed; `OPENAI_API_KEY` secret set. `lib/ai.ts` routes through it when `EXPO_PUBLIC_OPENAI_API_KEY` is unset
- [x] Share extension / deep link handler — done via `expo-share-intent`
- [x] Swipe-to-archive gesture on Inbox cards — `components/SwipeableCard.tsx` (PanResponder)

## Running the app
```powershell
cd C:\Users\user\trove
npx expo run:android   # Build dev client APK + install (required for share intent)
npx expo start --web   # Quick layout check in browser (no share intent, no native)
```

> **Share intent requires a dev build.** `expo-share-intent` uses native modules that don't
> work in Expo Go. Always use `npx expo run:android` (requires Android Studio + USB debugging or emulator).
>
> After any change to `app.json` plugins or native deps: `npx expo prebuild --no-install` then rebuild.

## Coding conventions
- Always use `StyleSheet.create()` — no inline style objects
- Import colors/fonts/spacing from `constants/theme.ts`
- Font families: headings use `FONTS.serif`, body uses `FONTS.sans` or `FONTS.sansMed`
- No comments unless the WHY is non-obvious
- Keep screens thin — logic belongs in hooks or lib files

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Cursor Cloud specific instructions

Trove is an Expo SDK 56 / React Native app (Supabase backend). Standard run/build commands
live in `CLAUDE.md` and `package.json` scripts — read those first.

**Install / dependencies**
- Always install with `npm install --legacy-peer-deps` (react peer-version conflict from
  expo-router's web deps — see `CLAUDE.md`). Plain `npm install` fails. The startup update
  script already runs this.
- Node 22 works. Only lockfile is `package-lock.json` (npm).

**What can and cannot run in the cloud VM**
- Native builds (`npm run android` / `npm run ios`, i.e. `expo run:*`) and share-intent testing
  are NOT possible here: there is no `/dev/kvm` (Android emulator can't be accelerated) and no
  macOS (iOS needs a Mac). Don't waste time trying to boot an emulator.
- The only runnable dev target in this VM is **Expo web**: `npx expo start --web` (a layout /
  functionality preview, per `CLAUDE.md`). Web-preview deps `react-dom`, `react-native-web`,
  and `@expo/metro-runtime` are in `package.json` for this.

**`.env.local` is required to boot** (gitignored, so create it if missing). Without a Supabase
URL, `createClient` in `lib/supabase.ts` throws and the app crashes at load. Placeholder values
are enough for **guest/local mode** (data stored in AsyncStorage → `localStorage` on web); use a
real Supabase project only when testing cloud sync / auth / edge functions:
```
EXPO_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
```

**Web preview gotchas (non-obvious):**
- `lib/supabase.ts` uses `expo-secure-store` (native-only) for the Supabase auth `storage`
  adapter. On web this throws `ExpoSecureStore.default.getValueWithKeyAsync is not a function`
  and crashes the app on load. To preview on web, temporarily add a `localStorage` fallback to
  that `storage` adapter guarded by `Platform.OS === 'web'` (mirror the web fallback already in
  `lib/entitlements.ts`). This is a native-first app, so keep such shims out of committed code.
- After a save, the web preview may do a brief full reload (blank screen + Expo cube logo) a few
  seconds later — a Metro/health-check quirk of the degraded web preview. Data persists across
  it. Running `npx expo start --web --no-dev --minify` reduces reload noise.
- Guest mode needs no login; new saves land in the **Inbox** tab.

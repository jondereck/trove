# Cloud-first auth gate (Approach 1)

**Date:** 2026-07-12  
**Status:** Approved for implementation planning  
**Goal:** Monetization path is **buy Trove Cloud → then create/sign in to an account**. Free and Unlocked stay local/guest. Existing Cloud subscribers always have a returning Sign in door.

---

## Problem

Today anyone can Sign up / Sign in. Account creation is decoupled from Cloud, which:

- Creates free Supabase accounts that never sync
- Blurs the product story (“why do I need an account?”)
- Conflicts with the intended model: **account = Cloud identity**

Blocking *all* auth for Free/Unlocked would lock out returning Cloud users on a new device (entitlement often lands only after Sign in + `Purchases.logIn(userId)`, or after Restore).

---

## Decision

**Approach 1 — Purchase-first + returning-user door**

| Audience | Auth access |
|----------|-------------|
| Free / Unlocked guest | No **Create account**. Returning door: **Already have Cloud? Sign in** |
| Guest who just bought / restored **Cloud** | Prompted to create account or sign in to enable sync |
| Existing Cloud user (new phone) | **Sign in** always available; Restore purchases as backup |
| Logged in without Cloud | Stay signed in; library stays **local**; soft nudge to Subscribe / Restore (no auto sign-out) |

Unlocked remains device-only: no account required, no account prompt after Unlocked purchase.

---

## Core rules

1. **Account = Cloud identity.** Free and Unlocked do not need (and should not be pushed into) account creation.
2. **Sign up** is gated on `hasCloud()` (or an explicit post-Cloud auth flag set right after purchase/restore).
3. **Sign in** stays reachable for returning users even when the current install is still Free.
4. **Data routing unchanged:** `lib/db.ts` uses cloud only when `isLoggedIn() && hasCloud()`.
5. **Migration unchanged:** on `SIGNED_IN`, existing `logInPurchases` + `maybeMigrateToCloud` (Cloud only) keep working.

---

## User flows

### New user → Cloud → account

```
Guest uses app (local)
  → Upgrade → purchase Trove Cloud
  → “Create an account to sync” prompt
  → Create account / Sign in / Not now
  → If account: migrate local → cloud
```

### Returning user (new device)

```
Install
  → Account: “Already have Cloud? Sign in”
  → Login / Google
  → Purchases.logIn(userId) restores Cloud entitlement
  → Library loads from cloud
```

Backup: Upgrade → Restore purchases → if Cloud and still guest → same account-link prompt.

### Sign in without Cloud

```
Sign in succeeds
  → Session kept
  → Library remains local
  → Soft nudge: Subscribe to Cloud or Restore purchases
```

---

## UI changes

| Surface | Change |
|---------|--------|
| `app/(auth)/index.tsx` | Remove “Create a free account”. Primary **Sign in**; secondary path to plans / Cloud. |
| `app/account.tsx` (guest) | Replace “Sign in or create account” with **Already have Cloud? Sign in** + **Get Trove Cloud** → `/upgrade`. |
| `app/upgrade.tsx` | After successful **Cloud** purchase (or Restore → cloud) while guest: show account-required prompt instead of only “Salamat” + back. |
| `app/(auth)/signup.tsx` | On mount: if `!hasCloud()` (and no valid post-Cloud flag), redirect to `/upgrade` with message. |
| Optional component | `CloudAccountPrompt` — shared sheet/modal for post-purchase and Account re-entry. |

### Copy

- Guest Account row: **Already have Cloud? Sign in**
- Post-Cloud title: **Create an account to sync**
- Post-Cloud body: **Trove Cloud is ready. Sign in or create an account so your library can sync across devices.**
- Actions: **Create account** · **Sign in** · **Not now**
- Logged-in, no Cloud: **You’re signed in. Subscribe to Cloud or Restore purchases to sync this library.**

**Not now:** Cloud entitlement stays active; sync waits until they create/sign in. Account screen keeps showing the sync CTA while `hasCloud() && !isLoggedIn()`.

---

## Technical design

### Gate helper — `lib/authGate.ts` (new)

- `canCreateAccount()` → `hasCloud()`
- `canOpenSignUp()` → same
- `shouldPromptAccountForCloud()` → `hasCloud() && !isLoggedIn()`
- Integrate with existing `lib/authNavigation.ts` (`requestAuthFlow`) so signup routes only open when the gate passes (or after an explicit Cloud purchase intent flag)

### Unchanged

- `lib/db.ts` pick: `isLoggedIn() && hasCloud() ? cloud : local`
- `app/_layout.tsx` `SIGNED_IN`: `syncProviderProfile`, `logInPurchases`, `maybeMigrateToCloud`
- Profile still follows login (`pickProfile` = logged in → cloud profile), not Cloud entitlement
- RevenueCat product IDs / Play Console setup

### Soft states / errors

| Case | Behavior |
|------|----------|
| Free user hits Sign up | Redirect Upgrade; Cloud required to create an account |
| Login, no Cloud | No auto sign-out; local library + nudge |
| Purchase cancelled | No account prompt |
| Restore Unlocked only | No account prompt |
| Cloud cancelled later | Keep login; fall back to local via existing `hasCloud()` |

---

## Edge cases

- Deep link / stale navigation to signup without Cloud → blocked
- Old free Supabase accounts → Sign in still works; no sync until Cloud
- Same Google Play account on new device → Restore can grant Cloud before Sign in; then prompt to link account
- Export / Import remains the Free/Unlocked multi-device workaround (unchanged)

---

## Manual verification

1. Free guest → Account: no Create account; Sign in + Get Cloud present
2. Force/simulate Cloud (`EXPO_PUBLIC_FORCE_TIER=cloud`) as guest → account prompt appears
3. Sign up after Cloud → local migrate to cloud works
4. Fresh install → Sign in as Cloud subscriber → library syncs
5. Sign in as account without Cloud → local only + soft nudge
6. Unlocked purchase → no account-required prompt
7. Post-Cloud **Not now** → Cloud active; later Account still shows sync CTA

---

## Out of scope

- Apple Sign In
- Changing store products or RevenueCat entitlement IDs
- Forcing migration/deletion of existing free Supabase users
- Hard-blocking Sign in for Free installs (rejected; breaks returning users)

---

## Soft verification (Level A) — implemented

After an intentional auth flow Sign in, once RevenueCat identity is linked:

- If `hasCloud()` → no prompt (returning Cloud user OK)
- If `!hasCloud()` → Alert: no Cloud on this account; actions OK / Restore / See plans
- Session is kept (local library); no auto sign-out
- Does not run on cold-start session restore (pending flag only set by `requestAuthFlow`)

---

## Success criteria

- New users cannot create an account without Cloud (or an equivalent post-Cloud gate flag)
- Returning Cloud users can Sign in on a new device without buying again
- Free / Unlocked remain fully usable as local/guest apps
- Sync still only happens when logged in **and** Cloud
- After returning Sign in without Cloud, user gets a one-shot verify alert (not on every app launch)

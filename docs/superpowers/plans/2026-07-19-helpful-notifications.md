# Helpful Local Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small set of *actually useful* local notifications that help users return to unread saves and keep their library healthy — without spam, remote push, or marketing noise.

**Architecture:** Stay on-device with `expo-notifications` (same stack as today’s inbox digest). Introduce a shared scheduler module that owns Android channels, permission checks, and cancel/reschedule. Each notification *kind* is a pure content+trigger builder plus a settings flag. The in-app `/notifications` log already records presented notifications — extend `screen` deep-links so taps land on the right tab/filter.

**Tech Stack:** Expo SDK 56, React Native, TypeScript (strict), `expo-notifications`, SecureStore settings (`lib/settings.ts`), local/cloud DB via `lib/db.ts`, `tsx --test`.

## Global Constraints

- Local notifications only — no FCM/APNs server, no Expo Push tokens, no remote campaigns
- Always install with `npm install --legacy-peer-deps`
- Colors/fonts/spacing from `constants/theme.ts` — never hardcode
- `StyleSheet.create()` only; headings `FONTS.serif`, body `FONTS.sans` / `FONTS.sansMed` / `FONTS.sansSemi`
- Update `DEVLOG.md` with a dated entry at the top after implementation
- Cloud VM can only verify via `tsx --test` + `tsc --noEmit` (no native notification delivery here)
- Web remains a no-op for scheduling (mirror `lib/digestNotifications.ts`)
- Default new toggles **off** so existing users are not surprised
- Never notify for: every individual save, AI organize progress, login/sync status, marketing, streaks that guilt-trip daily opens
- Copy must be calm and useful (Trove voice) — no “Don’t miss out!” / emoji spam

---

## Product decision — what is worth notifying?

Trove already has **Inbox digest** (`lib/digestNotifications.ts`): scheduled local reminder when Unsorted count &gt; 0.

| Kind | Helpful? | Why | Wave |
|------|----------|-----|------|
| **Unread review** | Yes — highest value | Matches the NEW / `is_viewed` model users already care about. “You have N unopened saves” is different from Unsorted. | **1** |
| **Smarter digest body** | Yes | Today’s body is only unsorted count. Include unread when both matter, or prefer the stronger signal. | **1** |
| **Backup health** | Yes — quiet | Auto-backup exists. Notify only if backup failed or has been overdue while enabled (not a cheerleading ping). | **2** |
| **Revisit nudge** | Maybe | Soft “haven’t opened Trove in 7+ days” with unread/inbox context. Easy to feel naggy — opt-in, weekly max. | **2** |
| Per-save “Saved!” push | No | In-app chest/toast already covers this; OS notifications on every share are noise. | Skip |
| Cloud sync / auth | No | Operational, not curated-content value. | Skip |
| Remote marketing push | No | Out of scope; needs server infra. | Skip |

**Wave 1 ship criteria:** Users can enable **Unread review** beside Inbox digest, share the same hour/cadence controls (YAGNI: one schedule clock), tap through to Library with unread filter, and see the event in `/notifications`.

---

## File map

| File | Responsibility |
|------|----------------|
| `lib/notificationKinds.ts` | **Create** — pure IDs, channel IDs, copy builders, deep-link payloads |
| `lib/notificationKinds.test.ts` | **Create** — copy + payload tests |
| `lib/notificationScheduler.ts` | **Create** — permissions, Android channels, cancel/schedule helpers |
| `lib/notificationScheduler.test.ts` | **Create** — schedule decision tests (enabled/count/platform) with injected deps |
| `lib/digestNotifications.ts` | Thin wrapper → scheduler for inbox digest (keep export names stable) |
| `lib/unreadNotifications.ts` | **Create** — `syncUnreadNotification()` using `fetchLibraryCount` / unread query |
| `lib/settings.ts` | Add `unreadDigestEnabled` (bool, default `false`) |
| `lib/settings.test.ts` | Assert default + patch round-trip |
| `lib/notificationLogCore.ts` | Extend `screen` union: `'inbox' \| 'library' \| 'library-unread' \| 'backup-settings'` |
| `lib/db.ts` / `localDb.ts` / `cloudDb.ts` | Ensure a cheap `fetchUnreadLibraryCount()` (or reuse filter count) |
| `app/notification-settings.tsx` | Unread toggle + shared schedule hint copy |
| `app/_layout.tsx` | Deep-link `library-unread` → `/(tabs)` + unread filter signal |
| `lib/libraryFilterIntent.ts` | **Create** — one-shot intent so Library opens on `unread` after notification tap |
| `DEVLOG.md` | Dated entry |

---

### Task 1: Pure notification kind helpers (copy + payloads)

**Files:**
- Create: `lib/notificationKinds.ts`
- Create: `lib/notificationKinds.test.ts`

**Interfaces:**
- Consumes: nothing from later tasks
- Produces:
  - `INBOX_DIGEST_ID = 'trove-inbox-digest'`
  - `UNREAD_DIGEST_ID = 'trove-unread-digest'`
  - `DIGEST_CHANNEL_ID = 'digests'`
  - `buildInboxDigestContent(count: number): { title: string; body: string; data: { screen: 'inbox' } }`
  - `buildUnreadDigestContent(count: number): { title: string; body: string; data: { screen: 'library-unread' } }`
  - `shouldScheduleCountDigest(enabled: boolean, count: number): boolean`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/notificationKinds.test.ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildInboxDigestContent,
  buildUnreadDigestContent,
  shouldScheduleCountDigest,
} from './notificationKinds'

describe('shouldScheduleCountDigest', () => {
  it('schedules only when enabled and count > 0', () => {
    assert.equal(shouldScheduleCountDigest(true, 3), true)
    assert.equal(shouldScheduleCountDigest(true, 0), false)
    assert.equal(shouldScheduleCountDigest(false, 5), false)
  })
})

describe('buildUnreadDigestContent', () => {
  it('uses singular copy and library-unread deep link', () => {
    const c = buildUnreadDigestContent(1)
    assert.equal(c.title, 'Unopened in Trove')
    assert.equal(c.body, 'You have 1 save you have not opened yet')
    assert.deepEqual(c.data, { screen: 'library-unread' })
  })

  it('uses plural copy', () => {
    assert.equal(buildUnreadDigestContent(4).body, 'You have 4 saves you have not opened yet')
  })
})

describe('buildInboxDigestContent', () => {
  it('keeps unsorted wording and inbox deep link', () => {
    const c = buildInboxDigestContent(2)
    assert.equal(c.title, 'Trove Inbox')
    assert.equal(c.body, 'You have 2 unsorted items')
    assert.deepEqual(c.data, { screen: 'inbox' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/notificationKinds.test.ts`

Expected: FAIL with module not found / cannot find module `./notificationKinds`

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/notificationKinds.ts
export const INBOX_DIGEST_ID = 'trove-inbox-digest'
export const UNREAD_DIGEST_ID = 'trove-unread-digest'
export const DIGEST_CHANNEL_ID = 'digests'

export function shouldScheduleCountDigest(enabled: boolean, count: number): boolean {
  return enabled && count > 0
}

export function buildInboxDigestContent(count: number) {
  const noun = count === 1 ? 'item' : 'items'
  return {
    title: 'Trove Inbox',
    body: `You have ${count} unsorted ${noun}`,
    data: { screen: 'inbox' as const },
  }
}

export function buildUnreadDigestContent(count: number) {
  const noun = count === 1 ? 'save' : 'saves'
  return {
    title: 'Unopened in Trove',
    body: `You have ${count} ${noun} you have not opened yet`,
    data: { screen: 'library-unread' as const },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/notificationKinds.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/notificationKinds.ts lib/notificationKinds.test.ts
git commit -m "feat(notifications): pure inbox and unread digest copy helpers"
```

---

### Task 2: Settings flag for unread digest

**Files:**
- Modify: `lib/settings.ts`
- Modify: `lib/settings.test.ts` (create if missing coverage for defaults)

**Interfaces:**
- Consumes: none
- Produces: `Settings.unreadDigestEnabled: boolean` default `false`

- [ ] **Step 1: Write the failing test**

```typescript
// append to lib/settings.test.ts (or create)
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getSettings, patchSettings, __resetSettingsForTests } from './settings'
// use whatever reset helper already exists in settings.test.ts

describe('unreadDigestEnabled', () => {
  it('defaults to false', async () => {
    // reset store to empty first (same pattern as existing settings tests)
    const s = await getSettings()
    assert.equal(s.unreadDigestEnabled, false)
  })

  it('round-trips via patchSettings', async () => {
    const next = await patchSettings({ unreadDigestEnabled: true })
    assert.equal(next.unreadDigestEnabled, true)
    assert.equal((await getSettings()).unreadDigestEnabled, true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/settings.test.ts`

Expected: FAIL on missing `unreadDigestEnabled` property

- [ ] **Step 3: Write minimal implementation**

In `lib/settings.ts`, add to `Settings` and `DEFAULTS`:

```typescript
  /** Local unread-review digest (NEW / is_viewed === false). */
  unreadDigestEnabled: boolean
```

```typescript
  unreadDigestEnabled: false,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/settings.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/settings.ts lib/settings.test.ts
git commit -m "feat(settings): add unreadDigestEnabled toggle default off"
```

---

### Task 3: Unread library count API

**Files:**
- Modify: `lib/localDb.ts`
- Modify: `lib/cloudDb.ts`
- Modify: `lib/db.ts`
- Create: `lib/unreadCount.test.ts` (local path only — pure filter helper if extracted)

**Interfaces:**
- Consumes: existing saves + `is_viewed`
- Produces: `fetchUnreadLibraryCount(): Promise<number>` from `lib/db.ts`

Prefer extracting a pure helper to keep cloud/local aligned:

```typescript
// lib/unreadCount.ts
import type { Save } from '../types'

export function countUnreadLibrarySaves(saves: Save[]): number {
  return saves.filter(s => s.is_viewed === false).length
}
```

Local implementation can count from stored saves (exclude nothing — Library unread includes inbox + filed). Cloud: `select('*', { count: 'exact', head: true }).eq('is_viewed', false)` with the same `hasViewedColumn` degrade used elsewhere (if column missing, return `0`).

- [ ] **Step 1: Write the failing test**

```typescript
// lib/unreadCount.test.ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { countUnreadLibrarySaves } from './unreadCount'
import type { Save } from '../types'

function save(partial: Partial<Save> & Pick<Save, 'id' | 'title'>): Save {
  return {
    type: 'link',
    tags: [],
    is_inbox: false,
    created_at: '2026-07-01T00:00:00.000Z',
    is_viewed: false,
    ...partial,
  } as Save
}

describe('countUnreadLibrarySaves', () => {
  it('counts only is_viewed === false', () => {
    const n = countUnreadLibrarySaves([
      save({ id: '1', title: 'a', is_viewed: false }),
      save({ id: '2', title: 'b', is_viewed: true }),
      save({ id: '3', title: 'c' }), // undefined treated as not unread
    ])
    assert.equal(n, 1)
  })
})
```

Match the app’s unread definition: Library filter uses `is_viewed === false` strictly (see `lib/localDb.ts`). Keep the test consistent — only explicit `false` counts.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/unreadCount.test.ts`

Expected: FAIL module not found

- [ ] **Step 3: Implement helper + db wiring**

```typescript
// lib/unreadCount.ts
import type { Save } from '../types'

export function countUnreadLibrarySaves(saves: Save[]): number {
  return saves.filter(s => s.is_viewed === false).length
}
```

In `localDb.ts`:

```typescript
export async function fetchUnreadLibraryCount(): Promise<number> {
  const saves = await readSaves() // use the existing private read helper name in that file
  return countUnreadLibrarySaves(saves)
}
```

In `cloudDb.ts`: probe viewed column; if unavailable return `0`; else head count with `.eq('is_viewed', false)`.

In `db.ts`:

```typescript
export const fetchUnreadLibraryCount = () => pick().fetchUnreadLibraryCount()
```

- [ ] **Step 4: Run tests**

Run: `npx tsx --test lib/unreadCount.test.ts`

Expected: PASS

Also run: `npx tsc --noEmit`

Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add lib/unreadCount.ts lib/unreadCount.test.ts lib/localDb.ts lib/cloudDb.ts lib/db.ts
git commit -m "feat(db): fetchUnreadLibraryCount for unread digests"
```

---

### Task 4: Shared scheduler + unread sync

**Files:**
- Create: `lib/notificationScheduler.ts`
- Create: `lib/notificationScheduler.test.ts`
- Create: `lib/unreadNotifications.ts`
- Modify: `lib/digestNotifications.ts` (delegate content + should-schedule; keep `syncDigestNotification` / `cancelDigestNotification` / `requestDigestPermissions` exports)

**Interfaces:**
- Consumes: `buildInboxDigestContent`, `buildUnreadDigestContent`, `shouldScheduleCountDigest`, `INBOX_DIGEST_ID`, `UNREAD_DIGEST_ID`, `DIGEST_CHANNEL_ID`, `getSettings`, `fetchInboxSaves`, `fetchUnreadLibraryCount`
- Produces:
  - `syncUnreadNotification(override?: Partial<Settings>): Promise<void>`
  - `cancelUnreadNotification(): Promise<void>`
  - `syncAllDigestNotifications(override?: Partial<Settings>): Promise<void>` — calls inbox + unread sync

Scheduler test should be dependency-injected so Node tests never import native `expo-notifications`:

```typescript
export interface ScheduleDigestParams {
  id: string
  enabled: boolean
  count: number
  title: string
  body: string
  data: Record<string, string>
  trigger: unknown
}

export function decideScheduleDigest(params: {
  enabled: boolean
  count: number
}): 'schedule' | 'skip' {
  return shouldScheduleCountDigest(params.enabled, params.count) ? 'schedule' : 'skip'
}
```

- [ ] **Step 1: Write the failing test**

```typescript
// lib/notificationScheduler.test.ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decideScheduleDigest } from './notificationScheduler'

describe('decideScheduleDigest', () => {
  it('skips when disabled or empty', () => {
    assert.equal(decideScheduleDigest({ enabled: false, count: 9 }), 'skip')
    assert.equal(decideScheduleDigest({ enabled: true, count: 0 }), 'skip')
  })
  it('schedules when enabled with items', () => {
    assert.equal(decideScheduleDigest({ enabled: true, count: 2 }), 'schedule')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/notificationScheduler.test.ts`

Expected: FAIL module not found

- [ ] **Step 3: Implement scheduler decisions + unread sync**

`lib/notificationScheduler.ts`:

```typescript
import { shouldScheduleCountDigest } from './notificationKinds'

export function decideScheduleDigest(params: {
  enabled: boolean
  count: number
}): 'schedule' | 'skip' {
  return shouldScheduleCountDigest(params.enabled, params.count) ? 'schedule' : 'skip'
}
```

`lib/unreadNotifications.ts` — mirror `digestNotifications.ts`:

1. `cancelUnreadNotification` cancels `UNREAD_DIGEST_ID`
2. `syncUnreadNotification` reads settings, cancels, returns early if `decideScheduleDigest` is skip / web / no permission
3. Uses same `digestHour` / `digestCadence` / `digestWeekday` as inbox (shared clock)
4. Schedules with `buildUnreadDigestContent(count)`

Refactor `syncDigestNotification` to use `buildInboxDigestContent` + `decideScheduleDigest`.

Add:

```typescript
export async function syncAllDigestNotifications(override?: Partial<Settings>) {
  await syncDigestNotification(override)
  await syncUnreadNotification(override)
}
```

Put `syncAllDigestNotifications` in `lib/digestNotifications.ts` (re-export unread) **or** a tiny `lib/notificationsSync.ts` — prefer `lib/notificationsSync.ts` to avoid circular imports:

```typescript
import { syncDigestNotification } from './digestNotifications'
import { syncUnreadNotification } from './unreadNotifications'
import type { Settings } from './settings'

export async function syncAllDigestNotifications(override?: Partial<Settings>) {
  await syncDigestNotification(override)
  await syncUnreadNotification(override)
}
```

- [ ] **Step 4: Run tests**

Run: `npx tsx --test lib/notificationScheduler.test.ts lib/notificationKinds.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/notificationScheduler.ts lib/notificationScheduler.test.ts lib/unreadNotifications.ts lib/notificationsSync.ts lib/digestNotifications.ts
git commit -m "feat(notifications): schedule unread digest beside inbox digest"
```

---

### Task 5: Wire sync call sites + Library unread deep link

**Files:**
- Create: `lib/libraryFilterIntent.ts`
- Create: `lib/libraryFilterIntent.test.ts`
- Modify: `app/_layout.tsx` (replace `syncDigestNotification` with `syncAllDigestNotifications`; handle `library-unread` tap)
- Modify: `app/(tabs)/index.tsx` (consume one-shot unread filter intent on focus)
- Modify: `app/save/[id].tsx`, `components/QuickSave.tsx` — call `syncAllDigestNotifications` where digest sync already runs

**Interfaces:**
- Consumes: notification `data.screen`
- Produces:
  - `setLibraryFilterIntent(filter: LibraryFilter): void`
  - `consumeLibraryFilterIntent(): LibraryFilter | null`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/libraryFilterIntent.test.ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { consumeLibraryFilterIntent, setLibraryFilterIntent } from './libraryFilterIntent'

describe('libraryFilterIntent', () => {
  it('returns filter once then clears', () => {
    setLibraryFilterIntent('unread')
    assert.equal(consumeLibraryFilterIntent(), 'unread')
    assert.equal(consumeLibraryFilterIntent(), null)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/libraryFilterIntent.test.ts`

Expected: FAIL module not found

- [ ] **Step 3: Implement intent + wiring**

```typescript
// lib/libraryFilterIntent.ts
import type { LibraryFilter } from '../types'

let pending: LibraryFilter | null = null

export function setLibraryFilterIntent(filter: LibraryFilter): void {
  pending = filter
}

export function consumeLibraryFilterIntent(): LibraryFilter | null {
  const next = pending
  pending = null
  return next
}
```

In `app/_layout.tsx` notification response handler:

```typescript
const data = response.notification.request.content.data as { screen?: string } | undefined
if (data?.screen === 'inbox') {
  router.push('/(tabs)/inbox')
} else if (data?.screen === 'library-unread') {
  setLibraryFilterIntent('unread')
  router.push('/(tabs)')
}
```

In Library `useFocusEffect`, after existing logic:

```typescript
const intent = consumeLibraryFilterIntent()
if (intent) setFilter(intent)
```

Replace digest-only sync imports with `syncAllDigestNotifications`.

Extend `NotificationLogEntry.screen` in `lib/notificationLogCore.ts`:

```typescript
screen?: 'inbox' | 'library-unread' | 'backup-settings'
```

Update `app/notifications.tsx` tap handler if it switches on `screen` (inbox-only today) to handle `library-unread` the same way as root layout.

- [ ] **Step 4: Run tests + typecheck**

Run:

```bash
npx tsx --test lib/libraryFilterIntent.test.ts lib/notificationKinds.test.ts lib/notificationScheduler.test.ts
npx tsc --noEmit
```

Expected: all PASS / exit 0

- [ ] **Step 5: Commit**

```bash
git add lib/libraryFilterIntent.ts lib/libraryFilterIntent.test.ts lib/notificationLogCore.ts app/_layout.tsx app/(tabs)/index.tsx app/notifications.tsx app/save/[id].tsx components/QuickSave.tsx
git commit -m "feat(notifications): deep-link unread digest into Library filter"
```

---

### Task 6: Notification settings UI

**Files:**
- Modify: `app/notification-settings.tsx`

**Interfaces:**
- Consumes: `unreadDigestEnabled`, `syncAllDigestNotifications`, `requestDigestPermissions`, `cancelUnreadNotification`
- Produces: Settings UI with two toggles sharing How often / Time of day

- [ ] **Step 1: Update section hint + add Unread row**

Replace the single-hint copy with:

```tsx
<Text style={styles.sectionHint}>
  Local reminders on this device. No account required. Inbox covers unsorted items; Unopened covers saves you have not opened yet. Both share the schedule below.
</Text>
```

Add group:

```tsx
<SettingGroup title="Reminders">
  <SettingRow
    icon="file-tray-outline"
    label="Inbox digest"
    hint="Unsorted saves waiting to be filed"
    toggle
    on={!!settings?.digestEnabled}
    onPress={toggleInbox}
  />
  <SettingRow
    icon="eye-outline"
    label="Unopened digest"
    hint="Saves marked NEW you have not opened"
    toggle
    on={!!settings?.unreadDigestEnabled}
    onPress={toggleUnread}
    last
  />
</SettingGroup>
```

Show schedule controls when `digestEnabled || unreadDigestEnabled`.

`toggleUnread` mirrors inbox permission flow; on disable call `cancelUnreadNotification()`; on any apply call `syncAllDigestNotifications(next)`.

- [ ] **Step 2: Manual structure check (no emulator in cloud VM)**

Run: `npx tsc --noEmit`

Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add app/notification-settings.tsx
git commit -m "feat(settings): unread digest toggle beside inbox digest"
```

---

### Task 7: DEVLOG + Wave 2 stub (docs only)

**Files:**
- Modify: `DEVLOG.md`
- Modify: this plan’s checkbox status only if executing

**Wave 2 (do not implement in Wave 1):**

1. **Backup health** — if `autoBackupEnabled` and last successful snapshot older than 2 local calendar days (or last run failed), schedule a one-shot local notification deep-linking to `backup-settings`. At most once per week.
2. **Revisit nudge** — if app not foregrounded for 7+ days AND (unread &gt; 0 OR inbox &gt; 0), weekly opt-in. Store `lastActiveAt` on `AppState` active.

- [ ] **Step 1: Add DEVLOG entry**

```markdown
### Helpful local notifications — unread digest (2026-07-19)
**Files:** `lib/notificationKinds.ts`, `lib/unreadNotifications.ts`, `lib/notificationsSync.ts`, …

Added an opt-in Unopened digest beside Inbox digest (shared schedule). Viewed-only
library counts drive copy; taps open Library on the Unread filter. Still local-only
via expo-notifications — no remote push.
```

- [ ] **Step 2: Commit**

```bash
git add DEVLOG.md
git commit -m "docs: devlog for unread digest notifications"
```

---

## Self-review

**1. Spec coverage**
- Product “what to notify” decision table → header + Wave 1/2 split
- Unread review notifications → Tasks 1–6
- Shared schedule / settings → Tasks 2, 4, 6
- Deep link to unread Library → Task 5
- Explicit non-goals (per-save, remote push, marketing) → Global Constraints
- Backup / revisit → Task 7 Wave 2 stub only

**2. Placeholder scan**
- No TBD/TODO left in Wave 1 steps; Wave 2 is explicitly deferred with concrete triggers

**3. Type consistency**
- `screen: 'library-unread'` used in kinds, log core, root layout, notifications list
- Setting key `unreadDigestEnabled` consistent across settings + UI
- IDs `trove-unread-digest` / `trove-inbox-digest` stable

---

## Manual test plan (device / dev build)

1. Settings → Notifications → enable **Unopened digest** (grant OS permission)
2. Ensure at least one save has `is_viewed === false`; set hour to next minute if testing triggers manually via a temporary debug schedule **or** call `syncUnreadNotification` after toggling and inspect scheduled notifications in OS settings
3. Tap notification → lands on Library with Unread filter active
4. Open the save → back → Unopened count drops; next sync skips when count is 0
5. Enable both digests → two scheduled IDs coexist; disable one cancels only that ID
6. Web preview → no throws (sync no-ops)

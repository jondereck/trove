# Trove Chest Loader Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the auto-share saving loader match the 6-scene chest storyboard exactly (3.2s loop, synced copy, finish-current-cycle + 800ms success hold, fade success before re-looping).

**Architecture:** Keep `lottie-react-native` as the visual engine and rebuild `assets/lottie/chest-save.json` so keyframes match the storyboard beats (including a green check that fades out at cycle end for seamless loops). Drive all copy + completion gating from a pure TypeScript module (`lib/chestLoaderTimeline.ts`) so scene text and loop/hold rules are unit-tested without React Native. `ShareSaveAnimation` is a thin orchestrator that calls `resolveLoaderPhase` as the single source of truth — plays one Lottie cycle at a time, restarts while still saving, holds Scene 6 for 800ms after a successful save, then fades out and notifies the share screen.

**Tech Stack:** Expo SDK 56, React Native, `lottie-react-native` ~7.3.4, TypeScript, Node built-in test runner via `tsx`

**Spec source:** `docs/superpowers/specs/2026-07-12-trove-chest-loader.md`

**Out of scope (YAGNI):** QuickSave bottom-sheet `loading` spinner, SaveToast redesign, share-review modal path. This plan only upgrades the auto-save full-screen loader used when **Review when sharing** is off.

---

## File structure

| File | Responsibility |
|------|----------------|
| `docs/superpowers/specs/2026-07-12-trove-chest-loader.md` | Locked product/motion spec |
| `lib/chestLoaderTimeline.ts` | Pure scene lookup + `resolveLoaderPhase` completion gate (no RN imports) |
| `lib/chestLoaderTimeline.test.ts` | Unit tests for timeline + completion rules |
| `assets/lottie/chest-save.json` | Rebuilt 192-frame / 60fps Lottie matching Scenes 1–6 |
| `components/ShareSaveAnimation.tsx` | UI orchestrator: Lottie + synced text + phase machine |
| `app/share.tsx` | Pass save-complete signal; wait for loader `onFinished` before toast |
| `package.json` | Add `tsx` + `test:timeline` script |
| `DEVLOG.md` | Dated entry for the change |

---

### Task 1: Timeline constants + phase machine (TDD)

**Files:**
- Create: `lib/chestLoaderTimeline.ts`
- Create: `lib/chestLoaderTimeline.test.ts`
- Modify: `package.json` (devDependency + script)

- [ ] **Step 1: Add the test runner dependency and script**

In `package.json`, add to `devDependencies`:

```json
"tsx": "^4.20.3"
```

Add to `scripts`:

```json
"test:timeline": "tsx --test lib/chestLoaderTimeline.test.ts"
```

Run:

```bash
npm install --legacy-peer-deps
```

Expected: install succeeds; `tsx` available.

- [ ] **Step 2: Write the failing tests**

Create `lib/chestLoaderTimeline.test.ts`:

```ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CYCLE_MS,
  SUCCESS_HOLD_MS,
  FADE_OUT_MS,
  sceneAt,
  resolveLoaderPhase,
} from './chestLoaderTimeline'

describe('chestLoaderTimeline', () => {
  it('exports the spec durations', () => {
    assert.equal(CYCLE_MS, 3200)
    assert.equal(SUCCESS_HOLD_MS, 800)
    assert.equal(FADE_OUT_MS, 260)
  })

  it('maps elapsed ms within a cycle to the six storyboard scenes', () => {
    assert.deepEqual(sceneAt(0), {
      index: 1,
      title: 'Stashing your link...',
      subtitle: 'Preparing your item',
    })
    assert.deepEqual(sceneAt(599), {
      index: 1,
      title: 'Stashing your link...',
      subtitle: 'Preparing your item',
    })
    assert.deepEqual(sceneAt(600), {
      index: 2,
      title: 'Stashing your link...',
      subtitle: 'Adding to your Trove',
    })
    assert.deepEqual(sceneAt(1300), {
      index: 3,
      title: 'Stashing your link...',
      subtitle: 'Organizing it for you',
    })
    assert.deepEqual(sceneAt(1800), {
      index: 4,
      title: 'Stashing your link...',
      subtitle: 'Almost there...',
    })
    assert.deepEqual(sceneAt(2300), {
      index: 5,
      title: 'Stashing your link...',
      subtitle: 'Finalizing',
    })
    assert.deepEqual(sceneAt(2900), {
      index: 6,
      title: 'Added to your Trove!',
      subtitle: 'Ready whenever you need it.',
    })
    assert.deepEqual(sceneAt(3199), {
      index: 6,
      title: 'Added to your Trove!',
      subtitle: 'Ready whenever you need it.',
    })
  })

  it('wraps elapsed time into the current cycle for scene lookup', () => {
    assert.equal(sceneAt(3200).index, 1)
    assert.equal(sceneAt(3800).index, 2)
    assert.equal(sceneAt(6100).index, 6)
  })

  it('keeps playing while save is still in flight', () => {
    assert.equal(
      resolveLoaderPhase({
        saveCompleted: false,
        outcome: 'pending',
        cycleElapsedMs: 3100,
      }),
      'playing'
    )
    assert.equal(
      resolveLoaderPhase({
        saveCompleted: false,
        outcome: 'pending',
        cycleElapsedMs: 3200,
      }),
      'restartCycle'
    )
  })

  it('finishes the current cycle after a successful save, then holds, then fades', () => {
    assert.equal(
      resolveLoaderPhase({
        saveCompleted: true,
        outcome: 'saved',
        cycleElapsedMs: 1000,
      }),
      'playing'
    )
    assert.equal(
      resolveLoaderPhase({
        saveCompleted: true,
        outcome: 'saved',
        cycleElapsedMs: 3200,
        holdElapsedMs: 0,
      }),
      'holdingSuccess'
    )
    assert.equal(
      resolveLoaderPhase({
        saveCompleted: true,
        outcome: 'saved',
        cycleElapsedMs: 3200,
        holdElapsedMs: 799,
      }),
      'holdingSuccess'
    )
    assert.equal(
      resolveLoaderPhase({
        saveCompleted: true,
        outcome: 'saved',
        cycleElapsedMs: 3200,
        holdElapsedMs: 800,
      }),
      'fadingOut'
    )
  })

  it('fades out immediately on duplicate/error without celebrating', () => {
    assert.equal(
      resolveLoaderPhase({
        saveCompleted: true,
        outcome: 'duplicate',
        cycleElapsedMs: 500,
      }),
      'fadingOut'
    )
    assert.equal(
      resolveLoaderPhase({
        saveCompleted: true,
        outcome: 'error',
        cycleElapsedMs: 500,
      }),
      'fadingOut'
    )
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm run test:timeline
```

Expected: FAIL — `Cannot find module './chestLoaderTimeline'` (or similar).

- [ ] **Step 4: Write minimal implementation**

Create `lib/chestLoaderTimeline.ts`:

```ts
export const CYCLE_MS = 3200
export const SUCCESS_HOLD_MS = 800
export const FADE_OUT_MS = 260

export type SaveOutcome = 'pending' | 'saved' | 'duplicate' | 'error'

export type LoaderPhase = 'playing' | 'restartCycle' | 'holdingSuccess' | 'fadingOut'

export interface ChestScene {
  index: 1 | 2 | 3 | 4 | 5 | 6
  title: string
  subtitle: string
}

const SCENES: Array<{ startMs: number; scene: ChestScene }> = [
  {
    startMs: 0,
    scene: {
      index: 1,
      title: 'Stashing your link...',
      subtitle: 'Preparing your item',
    },
  },
  {
    startMs: 600,
    scene: {
      index: 2,
      title: 'Stashing your link...',
      subtitle: 'Adding to your Trove',
    },
  },
  {
    startMs: 1300,
    scene: {
      index: 3,
      title: 'Stashing your link...',
      subtitle: 'Organizing it for you',
    },
  },
  {
    startMs: 1800,
    scene: {
      index: 4,
      title: 'Stashing your link...',
      subtitle: 'Almost there...',
    },
  },
  {
    startMs: 2300,
    scene: {
      index: 5,
      title: 'Stashing your link...',
      subtitle: 'Finalizing',
    },
  },
  {
    startMs: 2900,
    scene: {
      index: 6,
      title: 'Added to your Trove!',
      subtitle: 'Ready whenever you need it.',
    },
  },
]

export function cycleOffsetMs(elapsedMs: number): number {
  return ((elapsedMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS
}

export function sceneAt(elapsedMs: number): ChestScene {
  const t = cycleOffsetMs(elapsedMs)
  let current = SCENES[0].scene
  for (const entry of SCENES) {
    if (t >= entry.startMs) current = entry.scene
  }
  return current
}

export function resolveLoaderPhase(args: {
  saveCompleted: boolean
  outcome: SaveOutcome
  cycleElapsedMs: number
  holdElapsedMs?: number
}): LoaderPhase {
  if (args.saveCompleted && (args.outcome === 'error' || args.outcome === 'duplicate')) {
    return 'fadingOut'
  }

  if (!args.saveCompleted || args.outcome === 'pending') {
    if (args.cycleElapsedMs >= CYCLE_MS) return 'restartCycle'
    return 'playing'
  }

  // outcome === 'saved' — finish the current cycle first
  if (args.cycleElapsedMs < CYCLE_MS) {
    return 'playing'
  }

  const hold = args.holdElapsedMs ?? 0
  if (hold < SUCCESS_HOLD_MS) {
    return 'holdingSuccess'
  }

  return 'fadingOut'
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm run test:timeline
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/chestLoaderTimeline.ts lib/chestLoaderTimeline.test.ts
git commit -m "feat: add chest loader timeline module with tests"
```

---

### Task 2: Rebuild Lottie asset to match Scenes 1–6 at 60fps

**Files:**
- Modify: `assets/lottie/chest-save.json`

**Context:** The existing file is 96 frames @ 30fps (= 3.2s) with layers `glow`, `shadow`, `chestRoot`, `linkCard`, `body`, `lid`, `sparkle1–3`. Gaps vs the storyboard:

- Lid only opens to ~30° (spec: ~105°)
- Card flight / lid close timings are early vs Scenes 2–4
- No Scene 5 celebratory scale / expanded glow beat
- No green success check for Scene 6
- Only 3 sparkles (spec wants 4–6 on impact)
- No dust puff
- Authored at 30fps (spec: 60fps)
- Check does not fade before loop (spec: fade success state, then return to Scene 1)

Reuse the existing vector shapes (chest body, lid, link card, glow, shadow, stars). Rewrite keyframes; bump to `fr: 60`, `op: 192` (still 3.2s). Double every old frame index when porting (`frame60 = frame30 * 2`).

- [ ] **Step 1: Document target keyframe table (implement exactly)**

Convert seconds → frames (`frame = round(seconds * 60)`):

| Scene | Time | Frames | Visual |
|-------|------|--------|--------|
| 1 | 0.0–0.6s | 0–36 | Chest closed. Card floats ±4px. Tiny sparkles. Glow pulses ±5%. |
| 2 | 0.6–1.3s | 36–78 | Lid opens to −105° over 700ms (frames 36–78) with end bounce. Card tilts −8°, arcs into chest over ~500ms. |
| 3 | 1.3–1.8s | 78–108 | Card inside (opacity→0 as it enters). Squash chest to 96% on impact. 4–6 sparkles + dust puff. |
| 4 | 1.8–2.3s | 108–138 | Lid closes to 0° over 500ms with small bounce. |
| 5 | 2.3–2.9s | 138–174 | Glow expands/brightens. Sparkles rotate slowly. Chest scale 100→103→100. |
| 6 | 2.9–3.2s | 174–192 | Green check badge scales 0→1 at upper-right. Tiny celebratory bounce. Check opacity fades 100→0 in last ~120ms so loops don't hard-cut. |

Easing: Lottie bezier approximating easeInOutCubic via `i`/`o` tangents where practical. Timing accuracy at scene boundaries matters more than perfect cubic segments for v1.

- [ ] **Step 2: Rewrite layer keyframes in `chest-save.json`**

Keep existing shape groups. Set top-level `"fr": 60`, `"op": 192`. Update `ks` on each layer as follows (composition center ~200,200; keep current absolute positions consistent with today's file).

**`linkCard`**

```json
"o": { "a": 1, "k": [
  { "t": 0, "s": [100] },
  { "t": 78, "s": [100] },
  { "t": 90, "s": [0] },
  { "t": 192, "s": [0] }
]},
"r": { "a": 1, "k": [
  { "t": 0, "s": [0] },
  { "t": 36, "s": [0] },
  { "t": 60, "s": [-8] },
  { "t": 90, "s": [-8] },
  { "t": 192, "s": [-8] }
]},
"p": { "a": 1, "k": [
  { "t": 0, "s": [200, 56, 0] },
  { "t": 18, "s": [200, 52, 0] },
  { "t": 36, "s": [200, 56, 0] },
  { "t": 66, "s": [230, 140, 0] },
  { "t": 90, "s": [200, 250, 0] },
  { "t": 192, "s": [200, 250, 0] }
]},
"s": { "a": 1, "k": [
  { "t": 0, "s": [100, 100, 100] },
  { "t": 78, "s": [100, 100, 100] },
  { "t": 90, "s": [96, 96, 100] },
  { "t": 192, "s": [96, 96, 100] }
]}
```

**`lid`** (open ~105°, close with bounce)

```json
"r": { "a": 1, "k": [
  { "t": 0, "s": [0] },
  { "t": 36, "s": [0] },
  { "t": 72, "s": [-110] },
  { "t": 78, "s": [-105] },
  { "t": 108, "s": [-105] },
  { "t": 132, "s": [4] },
  { "t": 138, "s": [0] },
  { "t": 192, "s": [0] }
]}
```

**`chestRoot` scale** (impact squash Scene 3 + Scene 5 pulse + Scene 6 bounce)

```json
"s": { "a": 1, "k": [
  { "t": 0, "s": [100, 100, 100] },
  { "t": 78, "s": [100, 100, 100] },
  { "t": 90, "s": [96, 96, 100] },
  { "t": 108, "s": [100, 100, 100] },
  { "t": 138, "s": [100, 100, 100] },
  { "t": 156, "s": [103, 103, 100] },
  { "t": 174, "s": [100, 100, 100] },
  { "t": 180, "s": [102, 102, 100] },
  { "t": 192, "s": [100, 100, 100] }
]}
```

If squash is not visible because lid/body are not parented to `chestRoot`, set `"parent": <chestRoot ind>` on `lid` and `body`, or duplicate the scale track onto both. Prefer parenting.

**`glow`**

```json
"o": { "a": 1, "k": [
  { "t": 0, "s": [50] },
  { "t": 18, "s": [55] },
  { "t": 36, "s": [50] },
  { "t": 138, "s": [55] },
  { "t": 156, "s": [95] },
  { "t": 174, "s": [80] },
  { "t": 192, "s": [70] }
]},
"s": { "a": 1, "k": [
  { "t": 0, "s": [100, 100, 100] },
  { "t": 138, "s": [100, 100, 100] },
  { "t": 156, "s": [130, 130, 100] },
  { "t": 192, "s": [115, 115, 100] }
]}
```

**Sparkles (`sparkle1`–`sparkle3` existing + add `sparkle4`, `sparkle5`, `sparkle6`)**

- Scene 1 (frames 0–36): very small opacity blips on sparkle1/2 near the floating card.
- Scene 3 impact (frames 78–108): all 4–6 sparkles pop (scale 0→115→0, opacity pulse, slight rotation).
- Scene 5 (frames 138–174): slow rotation, soft opacity ~40–70.
- Positions (composition space):
  - sparkle1: `[150, 178]`
  - sparkle2: `[252, 168]`
  - sparkle3: `[204, 138]`
  - sparkle4: `[170, 210]`
  - sparkle5: `[240, 205]`
  - sparkle6: `[210, 160]`

Duplicate an existing sparkle layer JSON for 4–6; only change `ind`, `nm`, `p`, and stagger `t` by +4–8 frames (60fps).

**`dustPuff` (new layer, Scene 3 only)**

- Soft cream ellipse (`el`) under the chest mouth, fill `#fdf6ef` at ~40% opacity.
- Position ≈ `[200, 250]`
- Keys: opacity/scale 0 at frame 78 → pop at 86 → gone by 108.

**`checkBadge` (new layer, Scene 6 — fades out before loop)**

Add a new topmost layer (`ind` lower number = above in Lottie):

- Group: green circle (`el` + fill `#22C55E`) ~36×36
- Nested group: white check from two short `rc` bars rotated into a checkmark
- Position: upper-right of closed chest ≈ `[268, 200]`
- Keys (fade success before Scene 1 — required for seamless loop):

```json
"o": { "a": 1, "k": [
  { "t": 0, "s": [0] },
  { "t": 174, "s": [0] },
  { "t": 176, "s": [100] },
  { "t": 184, "s": [100] },
  { "t": 192, "s": [0] }
]},
"s": { "a": 1, "k": [
  { "t": 0, "s": [0, 0, 100] },
  { "t": 174, "s": [0, 0, 100] },
  { "t": 186, "s": [110, 110, 100] },
  { "t": 192, "s": [100, 100, 100] }
]}
```

When the save completes and we **hold** Scene 6, the orchestrator freezes Lottie on the peak-check frame (~184) so the fade-to-zero keys at 192 never play during the hold. Only looping plays through the fade.

- [ ] **Step 3: Sanity-check JSON**

Run:

```bash
node -e "const d=require('./assets/lottie/chest-save.json'); if(d.fr!==60||d.op!==192) throw new Error('duration mismatch: want 60fps/192f'); const names=d.layers.map(l=>l.nm); console.log(names.join(',')); if(!names.includes('checkBadge')) throw new Error('missing checkBadge'); if(!names.includes('dustPuff')) throw new Error('missing dustPuff'); if(names.filter(n=>n.startsWith('sparkle')).length<4) throw new Error('need 4+ sparkles'); console.log('ok', (d.op-d.ip)/d.fr+'s')"
```

Expected:

```
checkBadge,...,dustPuff,...,sparkle...,lid,body,linkCard,...
ok 3.2s
```

- [ ] **Step 4: Commit**

```bash
git add assets/lottie/chest-save.json
git commit -m "feat: rebuild chest-save Lottie for 6-scene 60fps storyboard"
```

---

### Task 3: Rewrite `ShareSaveAnimation` orchestrator

**Files:**
- Modify: `components/ShareSaveAnimation.tsx`

Replace the current static title + `loop` Lottie + `MIN_DISPLAY_MS` export with a phase machine driven by `resolveLoaderPhase`.

New public API:

```ts
import type { SaveOutcome } from '../lib/chestLoaderTimeline'

export { CYCLE_MS, SUCCESS_HOLD_MS, FADE_OUT_MS } from '../lib/chestLoaderTimeline'

interface ShareSaveAnimationProps {
  active: boolean
  /** Becomes true once quickSaveSharedUrl settles (any outcome). */
  saveCompleted: boolean
  outcome: SaveOutcome
  /** Called after success hold (saved) or immediate fade (duplicate/error), once fade-out finishes. */
  onFinished?: () => void
}
```

Remove `MIN_DISPLAY_MS` export (call sites updated in Task 4).

- [ ] **Step 1: Implement the component**

Replace `components/ShareSaveAnimation.tsx` entire file with:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import LottieView from 'lottie-react-native'
import { COLORS, FONTS, SPACING } from '../constants/theme'
import {
  CYCLE_MS,
  FADE_OUT_MS,
  SUCCESS_HOLD_MS,
  resolveLoaderPhase,
  sceneAt,
  type SaveOutcome,
} from '../lib/chestLoaderTimeline'

export { CYCLE_MS, SUCCESS_HOLD_MS, FADE_OUT_MS }

/** Peak check frame before the loop-fade keys (see Task 2 checkBadge). */
const HOLD_FRAME = 184

interface ShareSaveAnimationProps {
  active: boolean
  saveCompleted: boolean
  outcome: SaveOutcome
  onFinished?: () => void
}

export default function ShareSaveAnimation({
  active,
  saveCompleted,
  outcome,
  onFinished,
}: ShareSaveAnimationProps) {
  const [visible, setVisible] = useState(active)
  const [scene, setScene] = useState(() => sceneAt(0))
  const containerOpacity = useRef(new Animated.Value(0)).current
  const lottieRef = useRef<LottieView>(null)
  const cycleStartedAt = useRef(0)
  const holdStartedAt = useRef<number | null>(null)
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const finishedRef = useRef(false)
  const saveCompletedRef = useRef(saveCompleted)
  const outcomeRef = useRef(outcome)
  const onFinishedRef = useRef(onFinished)
  const holdingRef = useRef(false)

  saveCompletedRef.current = saveCompleted
  outcomeRef.current = outcome
  onFinishedRef.current = onFinished

  const clearTimers = () => {
    if (tickTimer.current) clearInterval(tickTimer.current)
    tickTimer.current = null
  }

  const fadeOutAndFinish = () => {
    if (finishedRef.current) return
    finishedRef.current = true
    clearTimers()
    Animated.timing(containerOpacity, {
      toValue: 0,
      duration: FADE_OUT_MS,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false)
      onFinishedRef.current?.()
    })
  }

  const beginCycle = () => {
    holdingRef.current = false
    holdStartedAt.current = null
    cycleStartedAt.current = Date.now()
    setScene(sceneAt(0))
    lottieRef.current?.reset()
    lottieRef.current?.play()
  }

  const enterHoldSuccess = () => {
    if (holdingRef.current) return
    holdingRef.current = true
    holdStartedAt.current = Date.now()
    setScene(sceneAt(CYCLE_MS - 1))
    // Freeze on the peak check frame so loop-fade keys do not run during hold.
    lottieRef.current?.pause()
    lottieRef.current?.play(HOLD_FRAME, HOLD_FRAME)
  }

  const evaluatePhase = () => {
    if (!active || finishedRef.current) return

    const cycleElapsedMs = Date.now() - cycleStartedAt.current
    const holdElapsedMs =
      holdStartedAt.current == null ? 0 : Date.now() - holdStartedAt.current

    const phase = resolveLoaderPhase({
      saveCompleted: saveCompletedRef.current,
      outcome: outcomeRef.current,
      cycleElapsedMs: holdingRef.current ? CYCLE_MS : cycleElapsedMs,
      holdElapsedMs,
    })

    if (!holdingRef.current) {
      setScene(sceneAt(cycleElapsedMs))
    }

    if (phase === 'restartCycle') {
      beginCycle()
      return
    }
    if (phase === 'holdingSuccess') {
      enterHoldSuccess()
      return
    }
    if (phase === 'fadingOut') {
      fadeOutAndFinish()
    }
  }

  useEffect(() => {
    if (!active) {
      clearTimers()
      holdingRef.current = false
      if (visible) {
        Animated.timing(containerOpacity, {
          toValue: 0,
          duration: FADE_OUT_MS,
          useNativeDriver: true,
        }).start(() => setVisible(false))
      }
      return
    }

    finishedRef.current = false
    setVisible(true)
    Animated.timing(containerOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start()

    beginCycle()
    tickTimer.current = setInterval(evaluatePhase, 50)

    return () => clearTimers()
  }, [active])

  // Duplicate/error (and late saved) re-evaluate immediately without waiting for the next tick.
  useEffect(() => {
    if (!active) return
    evaluatePhase()
  }, [active, saveCompleted, outcome])

  const handleAnimationFinish = () => {
    // Lottie finished one play-through; force a phase evaluation at cycle boundary.
    if (!active || finishedRef.current || holdingRef.current) return
    cycleStartedAt.current = Date.now() - CYCLE_MS
    evaluatePhase()
  }

  if (!visible) return null

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <View style={styles.content}>
        <LottieView
          ref={lottieRef}
          source={require('../assets/lottie/chest-save.json')}
          autoPlay={false}
          loop={false}
          style={styles.lottie}
          onAnimationFinish={handleAnimationFinish}
        />

        <Text style={styles.title}>{scene.title}</Text>
        <Text style={styles.subtitle}>{scene.subtitle}</Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    // Spec lists #FAF7F3; keep design-system token (visually equivalent warm off-white).
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  lottie: {
    width: 240,
    height: 240,
    marginBottom: SPACING.md,
  },
  title: {
    fontFamily: FONTS.serif,
    fontSize: 22,
    color: COLORS.text,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.textSub,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
})
```

Notes for the implementer:

- `resolveLoaderPhase` is the **only** decision function for restart / hold / fade — do not reintroduce a parallel `shouldRestartCycle` helper.
- Use `COLORS.bg` (`#faf9f5`), not a hardcoded `#FAF7F3` — design-system rule in `CLAUDE.md`.
- Green check lives inside the Lottie asset only.
- If `play(HOLD_FRAME, HOLD_FRAME)` is flaky on a platform, fall back to `lottieRef.current?.pause()` after seeking via `lottieRef.current?.play(HOLD_FRAME, HOLD_FRAME)` once; verify on Android + iOS.

- [ ] **Step 2: Typecheck the component**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors in `components/ShareSaveAnimation.tsx` / `lib/chestLoaderTimeline.ts`. (Pre-existing errors elsewhere may exist — do not expand scope; only fix errors introduced by this change.)

- [ ] **Step 3: Commit**

```bash
git add components/ShareSaveAnimation.tsx
git commit -m "feat: orchestrate chest loader via resolveLoaderPhase"
```

---

### Task 4: Wire `app/share.tsx` to the new completion protocol

**Files:**
- Modify: `app/share.tsx`

- [ ] **Step 1: Update imports and state**

Replace:

```tsx
import ShareSaveAnimation, { MIN_DISPLAY_MS } from '../components/ShareSaveAnimation'
```

with:

```tsx
import ShareSaveAnimation from '../components/ShareSaveAnimation'
import type { SaveOutcome } from '../lib/chestLoaderTimeline'
```

Add state next to `isAutoSaving`:

```tsx
const [saveCompleted, setSaveCompleted] = useState(false)
const [saveOutcome, setSaveOutcome] = useState<SaveOutcome>('pending')
const pendingToast = useRef<ToastState | null>(null)
```

Reset both in `finishShare`:

```tsx
setIsAutoSaving(false)
setSaveCompleted(false)
setSaveOutcome('pending')
pendingToast.current = null
```

- [ ] **Step 2: Rewrite `runAutoSave`**

Replace the body so it no longer sleeps on `MIN_DISPLAY_MS`. Instead it marks completion and lets the loader call `onFinished`:

```tsx
const runAutoSave = useCallback(async (url: string) => {
  setIsAutoSaving(true)
  setSaveCompleted(false)
  setSaveOutcome('pending')
  pendingToast.current = null

  try {
    const result = await quickSaveSharedUrl(url)
    if (result === 'saved') {
      pendingToast.current = {
        id: Date.now(),
        message: `Saved to ${UNSORTED_LABEL}`,
        tone: 'success',
      }
      setSaveOutcome('saved')
    } else if (result === 'duplicate') {
      pendingToast.current = {
        id: Date.now(),
        message: 'Already in Trove',
        tone: 'neutral',
      }
      setSaveOutcome('duplicate')
    } else {
      pendingToast.current = {
        id: Date.now(),
        message: 'Could not save this link',
        tone: 'error',
      }
      setSaveOutcome('error')
    }
    setSaveCompleted(true)
  } catch (e) {
    if (isLimitError(e)) {
      setSaveOutcome('error')
      setSaveCompleted(true)
      setIsAutoSaving(false)
      showLimitAlert(e)
      finishShare()
      return
    }
    pendingToast.current = {
      id: Date.now(),
      message: 'Could not save this link',
      tone: 'error',
    }
    setSaveOutcome('error')
    setSaveCompleted(true)
  }
}, [finishShare])
```

- [ ] **Step 3: Handle loader finished**

Add:

```tsx
const handleLoaderFinished = useCallback(() => {
  setIsAutoSaving(false)
  const next = pendingToast.current
  pendingToast.current = null
  if (next) {
    setToast(next)
  } else {
    finishShare()
  }
}, [finishShare])
```

Update JSX:

```tsx
<ShareSaveAnimation
  active={isAutoSaving}
  saveCompleted={saveCompleted}
  outcome={saveOutcome}
  onFinished={handleLoaderFinished}
/>
```

Keep `SaveToast` as-is (still calls `finishShare` on hide).

- [ ] **Step 4: Grep for leftover `MIN_DISPLAY_MS`**

Run:

```bash
rg "MIN_DISPLAY_MS" -n .
```

Expected: no matches (outside docs/history).

- [ ] **Step 5: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: no new errors from `app/share.tsx`.

- [ ] **Step 6: Commit**

```bash
git add app/share.tsx
git commit -m "feat: wait for chest loader cycle before share toast"
```

---

### Task 5: DEVLOG + final verification

**Files:**
- Modify: `DEVLOG.md`

- [ ] **Step 1: Prepend DEVLOG entry**

Add at the top of the entries (below the title blurb):

```markdown
### Chest loader — 6-scene storyboard match (2026-07-12)
**Files:** `lib/chestLoaderTimeline.ts`, `lib/chestLoaderTimeline.test.ts`,
`assets/lottie/chest-save.json`, `components/ShareSaveAnimation.tsx`, `app/share.tsx`,
`package.json`

Rebuilt the auto-share chest Lottie to the 6-scene storyboard (prepare → drop-in →
organize → close → finalize → green check) at 3.2s / 60fps. Scene copy is driven by
`chestLoaderTimeline.resolveLoaderPhase` and stays in sync with the animation. While the
network save is still in flight the cycle loops (check fades out before Scene 1). On
`saved` it finishes the current cycle, freezes Scene 6 for 800ms, then fades out before
the existing snackbar. Duplicate/error fades out immediately without the success hold.
Spec: `docs/superpowers/specs/2026-07-12-trove-chest-loader.md`.
```

- [ ] **Step 2: Re-run unit tests**

Run:

```bash
npm run test:timeline
```

Expected: all PASS.

- [ ] **Step 3: Manual verification checklist (dev build / web preview)**

Because native share-intent cannot run in the cloud VM, verify what you can:

1. **Orchestration smoke:** Temporarily render:

```tsx
<ShareSaveAnimation
  active
  saveCompleted={false}
  outcome="pending"
/>
```

Confirm subtitles advance roughly at 0.6 / 1.3 / 1.8 / 2.3 / 2.9s and Lottie restarts after 3.2s with the check fading (not hard-cutting).

2. **Saved path:** set `saveCompleted` true + `outcome="saved"` at ~1.0s — current cycle must finish, Scene 6 holds ~800ms on the peak check frame, then `onFinished` fires.

3. **Error path:** set `outcome="error"` mid-cycle — fade starts immediately; no long success hold.

4. **Native (on a machine with Android/iOS):** toggle **Review when sharing** off, share a URL into Trove, confirm motion matches the storyboard and snackbar appears only after the loader finishes. Rebuild required after Lottie/native module changes: `npx expo run:android` / `run:ios`.

5. Do **not** commit any temporary web SecureStore shim (AGENTS.md).

- [ ] **Step 4: Commit**

```bash
git add DEVLOG.md
git commit -m "docs: DEVLOG entry for 6-scene chest loader"
```

---

## Self-review

**Spec coverage**

| Spec requirement | Task |
|------------------|------|
| 3.2s cycle | Task 1 (`CYCLE_MS`), Task 2 (`op: 192` @ 60fps) |
| 60 FPS | Task 2 (`fr: 60`) |
| Scenes 1–6 visuals | Task 2 keyframe table |
| Scene copy text | Task 1 `sceneAt`, Task 3 render |
| Loop while still saving | Task 1 `restartCycle`, Task 3 phase tick |
| Fade success before re-loop | Task 2 `checkBadge` opacity → 0 by frame 192 |
| Finish current cycle if save early | Task 1–3 `playing` until `cycleElapsedMs >= CYCLE_MS` |
| Hold success 800ms then fade | Task 1 `holdingSuccess`, Task 3 freeze at `HOLD_FRAME` |
| easeInOutCubic / motion durations | Task 2 keyframe timing (700/500/500/600/250ms beats) |
| Soft glow, sparkles, dust, green check | Task 2 layers |
| Background warm off-white | Task 3 uses `COLORS.bg` (design-system equivalent of `#FAF7F3`) |

**Placeholder scan:** none — all steps include concrete code, commands, and expected output.

**Type consistency:** `SaveOutcome`, `LoaderPhase` (`playing` \| `restartCycle` \| `holdingSuccess` \| `fadingOut`), `CYCLE_MS`, `SUCCESS_HOLD_MS`, `FADE_OUT_MS`, `sceneAt`, `resolveLoaderPhase` names match across Tasks 1, 3, and 4. No unused parallel helpers. `MIN_DISPLAY_MS` is fully removed.

**Difference vs earlier draft plan (`#5`):** this plan (1) authors Lottie at 60fps, (2) uses `resolveLoaderPhase` as the single orchestrator API including `restartCycle`, (3) fades the success check inside the Lottie before Scene 1 so loops are not hard cuts, (4) freezes on `HOLD_FRAME` during the 800ms success hold so that fade does not play while celebrating.

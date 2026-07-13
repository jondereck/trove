# Chest Loader — Guaranteed-Working Saving Animation

> **For agentic workers:** Implement task-by-task, in order. Every task ends with a
> verification step — do not move on until it passes. Follow repo conventions in
> `CLAUDE.md` (theme tokens, `StyleSheet.create`, DEVLOG entry at the end).

**Goal:** The auto-share saving modal must show a beautiful, reliably-rendering chest
animation on a real Android device — every time, no detached fragments, no blank screen.

**Strategy:** Two paths, decided by a device check:

- **Path A (verify):** The Lottie fix (PR #9) may already work — the device might just
  have a stale bundle. Verify first before rewriting anything.
- **Path B (rebuild):** If Lottie still renders wrong OR looks cheap, replace only the
  *visual* with a code-drawn React Native `Animated` chest. Code-drawn Views cannot
  suffer Lottie JSON corruption (missing `parent` links, bad keyframes), render
  identically on every device, and are reviewable in a normal code diff.

**What is already good and must NOT be touched:**

| Piece | Why keep |
|-------|----------|
| `lib/chestLoaderTimeline.ts` | Scene copy + phase machine, 7 passing unit tests |
| `app/share.tsx` wiring | `active` / `saveCompleted` / `outcome` / `onFinished` contract works |
| Loop rules | 3.2s cycle, finish-cycle-then-hold-800ms on success, instant fade on duplicate/error |

Run the existing tests any time to confirm nothing regressed:

```powershell
npm run test:timeline
```

---

## Task 0 — Device verification (decides Path A vs B)

The layer-parenting fix is merged (`lid.parent = 12`, `body.parent = 12` in
`assets/lottie/chest-save.json`) and the regression test passes. But the device may
still be running an old JS bundle or an old dev build.

1. Clear caches and reinstall so the current `chest-save.json` is definitely bundled:

```powershell
cd C:\Users\user\trove
adb uninstall com.anonymous.trove
npx expo run:android
```

2. In Trove → **AI Preferences** → turn **OFF** "Review when sharing".
3. From Chrome, share any URL → Trove.
4. Judge against this checklist:

- [ ] Chest renders as one coherent object, centered (no floating fragments)
- [ ] Lid opens, card drops in, lid closes, glow pulse, green check appears
- [ ] Subtitles advance through all six scene texts
- [ ] On success: brief hold on the check, fade out, then snackbar
- [ ] Overall: smooth, premium — something you'd *want* users to see

**All boxes checked?** → Done. Write the DEVLOG entry (Task 4) noting verification
only, and stop.

**Any box failed?** → Execute Path B (Tasks 1–4). Do not attempt to hand-patch the
Lottie JSON again — that approach already broke twice.

---

## Path B — Code-drawn chest (pure RN `Animated`, no Lottie)

### Design

One new component owns all visuals: `components/ChestLoaderVisual.tsx`. It receives a
single `progress: Animated.Value` (0→1 over one 3.2s cycle) plus a `holding` flag, and
derives every movement with `interpolate`. `ShareSaveAnimation` keeps its phase logic
and swaps `LottieView` for this component.

```
ShareSaveAnimation (unchanged phase machine)
  ├─ drives progress: Animated.timing 0→1 over CYCLE_MS, restarted per cycle
  └─ <ChestLoaderVisual progress={progress} holding={holding} />
        chest body + lid (Views), link card, glow, sparkles, check badge
```

Visual spec (matches `docs/superpowers/specs/2026-07-12-trove-chest-loader.md`):

| Timeline (fraction of cycle) | Beat |
|---|---|
| 0.00–0.19 (Scene 1) | Chest closed. Card floats above (±4px sine-ish bob). Glow pulses subtly. |
| 0.19–0.41 (Scene 2) | Lid rotates open to ~-75° (hinge at back-top). Card tilts −8°, arcs down toward the opening. |
| 0.41–0.56 (Scene 3) | Card drops inside (scale→0.5, opacity→0). Chest squash-bounce scaleY 1→0.96→1. Sparkles burst (4–6, staggered opacity + translate). |
| 0.56–0.72 (Scene 4) | Lid closes smoothly, tiny bounce at the end. |
| 0.72–0.91 (Scene 5) | Glow expands + brightens, chest scale 1→1.03→1. |
| 0.91–1.00 (Scene 6) | Green check badge (circle + `checkmark` Ionicon) scales 0→1 upper-right, chest does a small celebratory bounce. |

Rules:

- **Everything from theme tokens** via `useColors()` / `useThemedStyles` — chest body
  `c.accent`, body face `c.cream`, card `c.card` with `c.border`, glow `c.accentSoft`,
  check `#2e9e5b` (only allowed literal — success green has no token; add a local
  `const SUCCESS_GREEN`).
- `useNativeDriver: true` for the cycle timing. All interpolations hang off the single
  `progress` value — no per-scene `setTimeout` choreography.
- Chest construction (plain Views): body = rounded rect (~120×84, `RADIUS.lg`),
  lid = rounded-top rect (~128×34) positioned above body, `transformOrigin` faked via
  translate-then-rotate around the back edge; latch = small accent square; keyhole =
  tiny dark circle. Shadow = flattened dark ellipse under chest at low opacity.
- Card = ~64×44 rounded rect with a `link-outline` Ionicon.
- Sparkles = 4–6 tiny rotated squares/circles positioned around the chest mouth,
  each with its own interpolation window inside Scene 3 / Scene 5.
- When `holding` is true, freeze at end-of-cycle pose (progress stays at 1: check
  visible, chest closed) — the parent stops the timing loop.

### Task 1 — Create `components/ChestLoaderVisual.tsx`

Props:

```ts
interface ChestLoaderVisualProps {
  progress: Animated.Value   // 0..1 across one cycle
  holding: boolean           // success hold: parked at end pose
}
```

Implementation notes:

- Export the component as default; no state, no timers inside — purely a function of
  `progress`.
- Use `progress.interpolate({ inputRange, outputRange })` with the fraction breakpoints
  from the table above. Clamp with `extrapolate: 'clamp'`.
- The card's arc: separate interpolations for `translateY` (−70 → −10 → 8) and
  `translateX` (6 → 0) with offset input ranges so the path curves instead of a
  straight drop.
- Lid rotation: `rotateX`-style tilt is not available reliably — use `rotate` (Z) on a
  lid wrapper whose anchor is shifted with a translate pair
  (`translateY: h/2 → rotate → translateY: -h/2` pattern).
- Verify no linter errors after writing.

Verification:

```powershell
npx tsc --noEmit
```

Expected: no new errors from `components/ChestLoaderVisual.tsx`.

Commit:

```powershell
git add components/ChestLoaderVisual.tsx
git commit -m "feat: code-drawn chest loader visual (RN Animated)"
```

### Task 2 — Swap Lottie out of `ShareSaveAnimation`

Modify `components/ShareSaveAnimation.tsx`:

1. Remove `LottieView` import and the `lottieRef` / `HOLD_FRAME` plumbing.
2. Add `const progress = useRef(new Animated.Value(0)).current` and a
   `const [holding, setHolding] = useState(false)`.
3. `beginCycle()`: `progress.setValue(0)` then
   `Animated.timing(progress, { toValue: 1, duration: CYCLE_MS, easing: Easing.linear, useNativeDriver: true }).start()`.
   (Scene-internal easing lives in the interpolations, so the master clock stays linear
   and in sync with `sceneAt()`.)
4. `enterHoldSuccess()`: stop the timing, `progress.setValue(1)`, `setHolding(true)`.
5. Replace `<LottieView …/>` with `<ChestLoaderVisual progress={progress} holding={holding} />`.
6. Keep: the 50ms tick, `resolveLoaderPhase` calls, fade in/out, `onFinished` contract,
   exported `CYCLE_MS` / `SUCCESS_HOLD_MS` / `FADE_OUT_MS`. **`app/share.tsx` must not
   need any change.**
7. Reset `holding` to `false` in `beginCycle()` and when `active` turns off.

Verification:

```powershell
npm run test:timeline
npx tsc --noEmit
```

Then device test (same steps as Task 0). All five checklist boxes must pass.

Commit:

```powershell
git add components/ShareSaveAnimation.tsx
git commit -m "feat: drive chest loader with code-drawn visual instead of Lottie"
```

### Task 3 — Retire the Lottie asset (cleanup)

Only after Task 2 passes on device:

1. Delete `assets/lottie/chest-save.json`.
2. Remove the Lottie-topology test block from `lib/chestLoaderTimeline.test.ts`
   (the parenting test now tests a deleted file). Keep all timeline/phase tests.
3. Remove `lottie-react-native` from `package.json` **only if** nothing else imports it:

```powershell
rg "lottie" --type ts --type tsx -l
```

If the only hits were the files above → `npm uninstall lottie-react-native --legacy-peer-deps`,
then `npx expo prebuild --no-install` and rebuild (native dep changed).

Verification: `npm run test:timeline` green; app builds and the loader still plays.

Commit:

```powershell
git add -A
git commit -m "chore: remove Lottie chest asset in favor of code-drawn loader"
```

### Task 4 — DEVLOG

Add a dated entry at the top of `DEVLOG.md`:

- **Path A outcome:** "Chest loader — verified on device (2026-07-13)" with the
  cache-clearing steps that resolved it.
- **Path B outcome:** "Chest loader — code-drawn RN Animated rebuild (2026-07-13)",
  files touched, and the WHY: hand-authored Lottie JSON broke twice on Android
  (layer parenting); Views + interpolations are deterministic and reviewable.

Commit together with the last code commit or as `docs: DEVLOG for chest loader fix`.

---

## Acceptance criteria (final)

- [ ] Sharing a URL with review OFF always shows the full animation on device
- [ ] All six scene subtitles appear in order, in sync with the visuals
- [ ] Success: cycle completes → 800ms check hold → fade → "Saved to Unsorted" snackbar
- [ ] Duplicate/error: loader fades out promptly, correct toast shows
- [ ] Dark mode: chest/glow/text all use palette tokens and look right
- [ ] `npm run test:timeline` passes; `npx tsc --noEmit` introduces no new errors

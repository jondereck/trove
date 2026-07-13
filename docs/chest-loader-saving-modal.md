# Trove Saving Modal — Chest Loader Reference

Quick reference for the auto-share saving loader: what was planned, what shipped, and the latest fix.

**Applies to:** Share-from-browser flow when **Review when sharing** is **OFF** (`app/share.tsx` → `ShareSaveAnimation`).

**Does not apply to:** In-app QuickSave bottom sheet (`+` button) or the share-review modal path.

---

## Original plan (storyboard spec)

Source: `docs/superpowers/specs/2026-07-12-trove-chest-loader.md`  
Implementation plan: `docs/superpowers/plans/2026-07-12-trove-chest-loader.md`

### Goal

Premium 6-scene chest animation that matches the storyboard as closely as possible.

### Timing

| Constant | Value |
|----------|-------|
| Cycle duration | **3.2 seconds** |
| Success hold (after save) | **800 ms** |
| Frame rate | **60 fps** (192 frames) |

### Six scenes

| Scene | Time | Title | Subtitle |
|-------|------|-------|----------|
| 1 | 0.0–0.6s | Stashing your link... | Preparing your item |
| 2 | 0.6–1.3s | Stashing your link... | Adding to your Trove |
| 3 | 1.3–1.8s | Stashing your link... | Organizing it for you |
| 4 | 1.8–2.3s | Stashing your link... | Almost there... |
| 5 | 2.3–2.9s | Stashing your link... | Finalizing |
| 6 | 2.9–3.2s | Added to your Trove! | Ready whenever you need it. |

### Visual beats (per scene)

1. **Prepare** — Closed chest, link card floats ±4px, tiny sparkles, glow pulses.
2. **Add** — Lid opens ~105° with bounce; card tilts −8° and arcs into chest.
3. **Organize** — Card drops inside; chest squashes to 96%; 4–6 sparkles + dust puff.
4. **Close** — Lid closes smoothly with small bounce.
5. **Finalize** — Glow expands; sparkles rotate; chest scales 100→103→100%.
6. **Success** — Green check upper-right; tiny celebratory bounce.

### Loop & completion rules

| Situation | Behavior |
|-----------|----------|
| Save still in flight | Loop 3.2s; fade success check before restarting Scene 1 |
| Save finished early | Finish current cycle first, then transition |
| Save succeeded | Hold Scene 6 for 800ms, then fade out loader, then snackbar |
| Duplicate / error | Fade out immediately (no success celebration) |

### Motion spec

- Easing: easeInOutCubic
- Chest open: 700ms
- Card flight: 500ms
- Chest close: 500ms
- Glow pulse: 600ms
- Success bounce: 250ms

### Assets

- Rounded treasure chest (open + closed lid)
- Rounded link card
- Sparkle particles (4–6)
- Soft radial glow
- Green success check
- Dust puff on impact

---

## What was implemented

Shipped in PR **#7** (2026-07-12), merged to `main`.

### Files touched

| File | Role |
|------|------|
| `lib/chestLoaderTimeline.ts` | Scene copy + `resolveLoaderPhase` state machine |
| `lib/chestLoaderTimeline.test.ts` | Unit tests for timeline + phases |
| `assets/lottie/chest-save.json` | 60fps Lottie (192 frames, 6 scenes) |
| `components/ShareSaveAnimation.tsx` | Lottie + synced text + hold/fade orchestration |
| `app/share.tsx` | Waits for loader `onFinished` before showing snackbar |
| `package.json` | `test:timeline` script + `tsx` devDependency |

### Architecture

```
share.tsx (auto-save)
  └─ ShareSaveAnimation
       ├─ LottieView (chest-save.json, loop=false, one cycle at a time)
       └─ chestLoaderTimeline
            ├─ sceneAt(ms)        → title + subtitle
            └─ resolveLoaderPhase → playing | restartCycle | holdingSuccess | fadingOut
```

### Phase machine (`resolveLoaderPhase`)

| Phase | When |
|-------|------|
| `playing` | Animation running; save may still be in flight |
| `restartCycle` | Save not done and 3.2s elapsed → restart Lottie |
| `holdingSuccess` | Save succeeded, cycle done → freeze on peak check frame 800ms |
| `fadingOut` | Hold complete, or duplicate/error → fade out → `onFinished` |

### Before vs after

| | Before (old loader) | After (storyboard) |
|---|---|---|
| Animation | Looping Lottie, static copy | 6 scenes, synced subtitles |
| Minimum display | `MIN_DISPLAY_MS` = 900ms | Cycle-driven (3.2s) + 800ms success hold |
| Toast timing | After fixed minimum | After loader finishes fading |
| Visual | Basic chest drop | Full storyboard (check, sparkles, glow, dust) |

---

## Latest change (bugfix)

**PR #9** (2026-07-13), merged to `main`.

### Problem

After the 60fps Lottie rebuild, `lid` and `body` lost their `parent` link to `chestRoot`. On Android this rendered detached fragments (glow/shadow centered, chest pieces in the wrong place) — matching the broken screenshots from device testing.

### Fix

- Restored `lid.parent` and `body.parent` → `chestRoot.ind` (12) in `assets/lottie/chest-save.json`
- Added regression test in `lib/chestLoaderTimeline.test.ts` that asserts both parent relationships

### What did *not* change

No new UX behavior — rendering fix only. Timeline, copy, loop rules, and completion gating are unchanged from PR #7.

---

## How to test on device

1. Pull latest `main` (includes PR #9).
2. Reload Metro or rebuild dev client if the old Lottie is cached:
   ```bash
   npx expo start --dev-client -c
   ```
3. In Trove → **AI Preferences** → turn **OFF** “Review when sharing”.
4. From Chrome/Safari, share any URL → choose Trove.
5. Expect centered chest animation through all 6 scenes, then snackbar.

If you still see detached fragments, uninstall/reinstall the dev build so the updated `chest-save.json` is bundled.

---

## Related docs & PRs

| Item | Link / path |
|------|-------------|
| Storyboard spec | `docs/superpowers/specs/2026-07-12-trove-chest-loader.md` |
| Implementation plan | `docs/superpowers/plans/2026-07-12-trove-chest-loader.md` |
| Earlier draft plan (30fps) | `docs/superpowers/plans/2026-07-12-chest-loader-animation.md` |
| Feature PR | [#7](https://github.com/jondereck/trove/pull/7) |
| Layer parenting fix | [#9](https://github.com/jondereck/trove/pull/9) |
| DEVLOG entries | `DEVLOG.md` — 2026-07-12 implementation, 2026-07-13 fix |

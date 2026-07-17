export const PENDING_LOOP_MS = 2600
export const SUCCESS_MS = 600
export const SUCCESS_HOLD_MS = 800
export const FADE_OUT_MS = 260

export type SaveOutcome = 'pending' | 'saved' | 'duplicate' | 'error'

export type LoaderPhase =
  | 'playing'
  | 'restartCycle'
  | 'playingSuccess'
  | 'holdingSuccess'
  | 'fadingOut'

export interface ChestScene {
  index: 1 | 2 | 3 | 4 | 5 | 6
  title: string
  subtitle: string
}

const PENDING_SCENES: Array<{ startMs: number; scene: ChestScene }> = [
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
]

export const SUCCESS_SCENE: ChestScene = {
  index: 6,
  title: 'Added to your Trove!',
  subtitle: 'Ready whenever you need it.',
}

export function pendingOffsetMs(elapsedMs: number): number {
  return ((elapsedMs % PENDING_LOOP_MS) + PENDING_LOOP_MS) % PENDING_LOOP_MS
}

export function sceneAt(elapsedMs: number): ChestScene {
  const t = pendingOffsetMs(elapsedMs)
  let current = PENDING_SCENES[0].scene
  for (const entry of PENDING_SCENES) {
    if (t >= entry.startMs) current = entry.scene
  }
  return current
}

export function sceneForAnimation(
  pendingElapsedMs: number,
  successElapsedMs?: number,
): ChestScene {
  return successElapsedMs == null ? sceneAt(pendingElapsedMs) : SUCCESS_SCENE
}

export function resolveLoaderPhase(args: {
  saveCompleted: boolean
  outcome: SaveOutcome
  cycleElapsedMs: number
  successElapsedMs?: number
  holdElapsedMs?: number
}): LoaderPhase {
  if (args.saveCompleted && (args.outcome === 'error' || args.outcome === 'duplicate')) {
    return 'fadingOut'
  }

  if (!args.saveCompleted || args.outcome === 'pending') {
    if (args.cycleElapsedMs >= PENDING_LOOP_MS) return 'restartCycle'
    return 'playing'
  }

  if (args.cycleElapsedMs < PENDING_LOOP_MS) {
    return 'playing'
  }

  const successElapsedMs = args.successElapsedMs
  if (successElapsedMs == null || successElapsedMs < SUCCESS_MS) {
    return 'playingSuccess'
  }

  const hold = args.holdElapsedMs ?? 0
  if (hold < SUCCESS_HOLD_MS) {
    return 'holdingSuccess'
  }

  return 'fadingOut'
}

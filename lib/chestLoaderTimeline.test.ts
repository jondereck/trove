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

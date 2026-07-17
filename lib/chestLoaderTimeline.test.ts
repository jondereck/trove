import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PENDING_LOOP_MS,
  SUCCESS_MS,
  SUCCESS_HOLD_MS,
  FADE_OUT_MS,
  sceneAt,
  sceneForAnimation,
  SUCCESS_SCENE,
  resolveLoaderPhase,
} from './chestLoaderTimeline'

describe('chestLoaderTimeline', () => {
  it('exports the spec durations', () => {
    assert.equal(PENDING_LOOP_MS, 2600)
    assert.equal(SUCCESS_MS, 600)
    assert.equal(SUCCESS_HOLD_MS, 800)
    assert.equal(FADE_OUT_MS, 260)
  })

  it('maps pending elapsed time only to non-success storyboard scenes', () => {
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
    assert.deepEqual(sceneAt(2599), {
      index: 5,
      title: 'Stashing your link...',
      subtitle: 'Finalizing',
    })
    assert.deepEqual(SUCCESS_SCENE, {
      index: 6,
      title: 'Added to your Trove!',
      subtitle: 'Ready whenever you need it.',
    })
  })

  it('wraps pending elapsed time without ever returning success', () => {
    assert.equal(sceneAt(2600).index, 1)
    assert.equal(sceneAt(3200).index, 2)
    assert.equal(sceneAt(5500).index, 1)
  })

  it('keeps the success copy visible throughout the success animation', () => {
    assert.equal(sceneForAnimation(1200, undefined).index, 2)
    assert.deepEqual(sceneForAnimation(2600, 0), SUCCESS_SCENE)
    assert.deepEqual(sceneForAnimation(2600, 300), SUCCESS_SCENE)
  })

  it('keeps playing while save is still in flight', () => {
    assert.equal(
      resolveLoaderPhase({
        saveCompleted: false,
        outcome: 'pending',
        cycleElapsedMs: 2500,
      }),
      'playing'
    )
    assert.equal(
      resolveLoaderPhase({
        saveCompleted: false,
        outcome: 'pending',
        cycleElapsedMs: 2600,
      }),
      'restartCycle'
    )
  })

  it('finishes the pending loop before playing success once, then holds and fades', () => {
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
        cycleElapsedMs: 2600,
      }),
      'playingSuccess'
    )
    assert.equal(
      resolveLoaderPhase({
        saveCompleted: true,
        outcome: 'saved',
        cycleElapsedMs: 2600,
        successElapsedMs: 599,
      }),
      'playingSuccess'
    )
    assert.equal(
      resolveLoaderPhase({
        saveCompleted: true,
        outcome: 'saved',
        cycleElapsedMs: 2600,
        successElapsedMs: 600,
        holdElapsedMs: 0,
      }),
      'holdingSuccess'
    )
    assert.equal(
      resolveLoaderPhase({
        saveCompleted: true,
        outcome: 'saved',
        cycleElapsedMs: 2600,
        successElapsedMs: 600,
        holdElapsedMs: 799,
      }),
      'holdingSuccess'
    )
    assert.equal(
      resolveLoaderPhase({
        saveCompleted: true,
        outcome: 'saved',
        cycleElapsedMs: 2600,
        successElapsedMs: 600,
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

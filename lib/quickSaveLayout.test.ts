import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { quickSaveBottomPadding } from './quickSaveLayout'

describe('quickSaveBottomPadding', () => {
  it('uses the Android keyboard height while the keyboard is visible', () => {
    assert.equal(quickSaveBottomPadding('android', 320, 24), 320)
  })

  it('uses the safe-area inset when the keyboard is hidden or on iOS', () => {
    assert.equal(quickSaveBottomPadding('android', 0, 24), 24)
    assert.equal(quickSaveBottomPadding('ios', 320, 24), 24)
  })
})

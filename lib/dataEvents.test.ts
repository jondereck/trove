import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emitDataChange, emitViewedChange, subscribeDataChanges } from './dataEvents'

describe('dataEvents viewed changes', () => {
  it('delivers viewed payload without a full saves reload signal', () => {
    const events: Array<{ change: string; payload?: { id: string; is_viewed: boolean } }> = []
    const unsub = subscribeDataChanges((change, payload) => {
      events.push({ change, payload })
    })

    emitViewedChange({ id: 's1', is_viewed: true })
    emitDataChange('saves')

    unsub()

    assert.deepEqual(events, [
      { change: 'viewed', payload: { id: 's1', is_viewed: true } },
      { change: 'saves', payload: undefined },
    ])
  })
})

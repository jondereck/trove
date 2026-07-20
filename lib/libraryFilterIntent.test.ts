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

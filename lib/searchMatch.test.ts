import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fieldMatchesTerm, tagMatchesTerm } from './searchMatch'

describe('tagMatchesTerm', () => {
  it('matches substring in a single tag (hair → haircut)', () => {
    assert.equal(tagMatchesTerm('hair', ['haircut']), true)
  })

  it('matches substring case-insensitively', () => {
    assert.equal(tagMatchesTerm('DESIGN', ['ui-design']), true)
  })

  it('does not require exact tag equality', () => {
    assert.equal(tagMatchesTerm('hair', ['skin-care', 'haircut']), true)
  })

  it('returns false when no tag contains the term', () => {
    assert.equal(tagMatchesTerm('boat', ['haircut']), false)
  })
})

describe('fieldMatchesTerm', () => {
  it('matches partial text in title', () => {
    assert.equal(fieldMatchesTerm('mis', 'miso soup recipe'), true)
  })
})

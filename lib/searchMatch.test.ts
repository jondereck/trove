import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fieldMatchesTerm, rankSavesByTerms, tagMatchesTerm } from './searchMatch'

const save = (overrides: Partial<{ id: string; title: string; tags: string[]; created_at: string }>) => ({
  id: overrides.id ?? '1',
  user_id: 'u1',
  title: overrides.title ?? 'Untitled',
  type: 'link' as const,
  tags: overrides.tags ?? [],
  is_inbox: false,
  created_at: overrides.created_at ?? '2026-01-01T00:00:00.000Z',
})

describe('tagMatchesTerm', () => {
  it('matches substring in a single tag (hair → haircut)', () => {
    assert.equal(tagMatchesTerm('hair', ['haircut']), true)
  })

  it('matches substring case-insensitively', () => {
    assert.equal(tagMatchesTerm('Hair', ['HAIRCUT']), true)
    assert.equal(tagMatchesTerm('DESIGN', ['ui-design']), true)
  })

  it('trims tag whitespace before matching', () => {
    assert.equal(tagMatchesTerm('hair', ['  haircut  ']), true)
  })

  it('does not require exact tag equality', () => {
    assert.equal(tagMatchesTerm('hair', ['skin-care', 'haircut']), true)
  })

  it('returns false when no tag contains the term', () => {
    assert.equal(tagMatchesTerm('boat', ['haircut']), false)
  })
})

describe('fieldMatchesTerm', () => {
  it('matches partial text in title case-insensitively', () => {
    assert.equal(fieldMatchesTerm('mis', 'miso soup recipe'), true)
    assert.equal(fieldMatchesTerm('HAIR', 'Hair Tips'), true)
  })
})

describe('rankSavesByTerms', () => {
  it('finds saves whose tag contains the query (hair → haircut)', () => {
    const results = rankSavesByTerms(
      [
        save({ id: 'a', title: 'Salon visit', tags: ['haircut'] }),
        save({ id: 'b', title: 'Recipes', tags: ['cooking'] }),
      ],
      ['hair'],
    )
    assert.deepEqual(results.map(r => r.id), ['a'])
  })

  it('is case-insensitive for tags and titles', () => {
    const results = rankSavesByTerms(
      [save({ id: 'a', title: 'Other', tags: ['HairCut'] })],
      ['HAIR'],
    )
    assert.equal(results.length, 1)
    assert.equal(results[0].id, 'a')
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatProfileName, namesFromUserMetadata } from './profileCache'

describe('namesFromUserMetadata', () => {
  it('reads given_name and family_name', () => {
    assert.deepEqual(
      namesFromUserMetadata({ given_name: 'Jon', family_name: 'Nifas' }),
      { first: 'Jon', last: 'Nifas' },
    )
  })

  it('splits full_name when given/family are missing', () => {
    assert.deepEqual(
      namesFromUserMetadata({ full_name: 'Jon Nifas' }),
      { first: 'Jon', last: 'Nifas' },
    )
  })
})

describe('formatProfileName', () => {
  it('joins first and last name', () => {
    assert.equal(formatProfileName('Jon', 'Nifas'), 'Jon Nifas')
  })

  it('falls back to email local-part when names are empty', () => {
    assert.equal(formatProfileName('', '', 'jon@example.com'), 'jon')
  })
})

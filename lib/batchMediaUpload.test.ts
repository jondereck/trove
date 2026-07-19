import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAX_BATCH_IMAGES } from '../constants/mediaUpload'

describe('batchMediaUpload constants', () => {
  it('caps batch selection at 10 images', () => {
    assert.equal(MAX_BATCH_IMAGES, 10)
  })
})

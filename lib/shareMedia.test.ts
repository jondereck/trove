import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getShareableMediaFiles } from './shareMediaCore'

describe('getShareableMediaFiles', () => {
  it('keeps images and videos only', () => {
    const files = getShareableMediaFiles([
      { path: 'file:///a.jpg', mimeType: 'image/jpeg', fileName: 'a.jpg', size: 1, width: null, height: null, duration: null },
      { path: 'file:///b.mp4', mimeType: 'video/mp4', fileName: 'b.mp4', size: 2, width: null, height: null, duration: null },
      { path: 'file:///c.pdf', mimeType: 'application/pdf', fileName: 'c.pdf', size: 3, width: null, height: null, duration: null },
    ])
    assert.equal(files.length, 2)
    assert.equal(files[0].fileName, 'a.jpg')
    assert.equal(files[1].fileName, 'b.mp4')
  })

  it('caps at MAX_SHARE_MEDIA', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      path: `file:///img-${i}.jpg`,
      mimeType: 'image/jpeg',
      fileName: `img-${i}.jpg`,
      size: 1,
      width: null,
      height: null,
      duration: null,
    }))
    assert.equal(getShareableMediaFiles(many).length, 10)
  })
})

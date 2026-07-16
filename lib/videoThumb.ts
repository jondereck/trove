import { Platform } from 'react-native'
import { createVideoPlayer, type VideoPlayer } from 'expo-video'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as FileSystem from 'expo-file-system/legacy'
import { uploadMedia } from './storage'

function waitForPlayerReady(player: VideoPlayer, timeoutMs = 10000): Promise<void> {
  if (player.status === 'readyToPlay') return Promise.resolve()

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.remove()
      reject(new Error('Video thumbnail timed out'))
    }, timeoutMs)

    const subscription = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'readyToPlay') {
        clearTimeout(timer)
        subscription.remove()
        resolve()
      } else if (status === 'error') {
        clearTimeout(timer)
        subscription.remove()
        reject(error ?? new Error('Video player error'))
      }
    })
  })
}

/** Extract a still frame from a local/remote video and return a file:// URI. */
export async function generateVideoThumbnailUri(videoUri: string): Promise<string | null> {
  if (Platform.OS === 'web') return null

  const player = createVideoPlayer(videoUri)
  player.muted = true
  try {
    await waitForPlayerReady(player)
    const thumbs = await player.generateThumbnailsAsync([1], { maxWidth: 720 })
    const thumb = thumbs[0]
    if (!thumb) return null

    const context = ImageManipulator.manipulate(thumb)
    context.resize({ width: 720, height: null })
    const rendered = await context.renderAsync()
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 })
    return saved.uri
  } catch (e) {
    console.warn('generateVideoThumbnailUri:', e)
    return null
  } finally {
    player.release()
  }
}

/** Generate a still, upload/persist it, and return a public or local URI for image_url. */
export async function generateAndUploadVideoThumbnail(videoUri: string): Promise<string | null> {
  const localUri = await generateVideoThumbnailUri(videoUri)
  if (!localUri) return null

  try {
    const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' })
    return await uploadMedia(base64, 'jpg', 'image/jpeg')
  } catch (e) {
    console.warn('generateAndUploadVideoThumbnail:', e)
    return localUri
  }
}

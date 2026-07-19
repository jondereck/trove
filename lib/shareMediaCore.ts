import type { ShareIntentFile } from 'expo-share-intent'
import { MAX_SHARE_MEDIA } from '../constants/mediaUpload'

export function getShareableMediaFiles(
  files: ShareIntentFile[] | null | undefined,
): ShareIntentFile[] {
  if (!files?.length) return []
  return files
    .filter(file =>
      file.mimeType.startsWith('image/') || file.mimeType.startsWith('video/'),
    )
    .slice(0, MAX_SHARE_MEDIA)
}

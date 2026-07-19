import type { ShareIntentFile } from 'expo-share-intent'
import type * as ImagePicker from 'expo-image-picker'
import { getShareableMediaFiles } from './shareMediaCore'
import { createSave } from './db'
import { prepareMediaForUpload, uploadMedia } from './storage'
import { generateAndUploadVideoThumbnail } from './videoThumb'

export type ShareMediaResult = 'saved' | 'error'

export { getShareableMediaFiles } from './shareMediaCore'

function toPickerAsset(file: ShareIntentFile): ImagePicker.ImagePickerAsset {
  return {
    uri: file.path,
    mimeType: file.mimeType,
    fileName: file.fileName,
    width: file.width ?? 0,
    height: file.height ?? 0,
    fileSize: file.size ?? undefined,
    duration: file.duration ?? undefined,
  }
}

export async function quickSaveSharedMedia(
  files: ShareIntentFile[],
  onProgress?: (done: number, total: number) => void,
): Promise<ShareMediaResult> {
  const slice = getShareableMediaFiles(files)
  if (!slice.length) return 'error'

  let saved = 0

  for (let i = 0; i < slice.length; i++) {
    const file = slice[i]
    const kind = file.mimeType.startsWith('video/') ? 'video' : 'image'

    try {
      const media = await prepareMediaForUpload(toPickerAsset(file), kind)
      const publicUrl = await uploadMedia(media.base64, media.ext, media.mime)
      if (!publicUrl) continue

      let imageUrl: string | undefined = kind === 'image' ? publicUrl : undefined
      if (kind === 'video') {
        imageUrl = (await generateAndUploadVideoThumbnail(file.path)) ?? undefined
      }

      const title = file.fileName?.replace(/\.[^.]+$/, '') || (kind === 'video' ? 'Video' : 'Photo')
      const save = await createSave({
        url: kind === 'video' ? publicUrl : undefined,
        title,
        type: kind,
        image_url: imageUrl,
        tags: [],
        is_inbox: true,
      })
      if (save) saved++
    } catch {
      // skip files that fail size checks or upload
    }

    onProgress?.(i + 1, slice.length)
  }

  return saved > 0 ? 'saved' : 'error'
}

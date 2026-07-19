import type * as ImagePicker from 'expo-image-picker'
import { MAX_BATCH_IMAGES } from '../constants/mediaUpload'
import { prepareMediaForUpload, uploadMedia, MediaTooLargeError } from './storage'

export { MAX_BATCH_IMAGES } from '../constants/mediaUpload'

export interface BatchUploadResult {
  uploaded: { publicUrl: string; fileName?: string | null }[]
  failures: { fileName?: string | null; message: string }[]
}

export async function uploadImageBatch(
  assets: ImagePicker.ImagePickerAsset[],
  onProgress?: (done: number, total: number) => void,
): Promise<BatchUploadResult> {
  const uploaded: BatchUploadResult['uploaded'] = []
  const failures: BatchUploadResult['failures'] = []
  const slice = assets.slice(0, MAX_BATCH_IMAGES)

  for (let i = 0; i < slice.length; i++) {
    const asset = slice[i]
    try {
      const media = await prepareMediaForUpload(asset, 'image')
      const publicUrl = await uploadMedia(media.base64, media.ext, media.mime)
      if (!publicUrl) {
        failures.push({ fileName: asset.fileName, message: 'Upload failed.' })
      } else {
        uploaded.push({ publicUrl, fileName: asset.fileName })
      }
    } catch (e) {
      const message = e instanceof MediaTooLargeError
        ? e.message
        : (e as Error)?.message ?? 'Could not read the selected file.'
      failures.push({ fileName: asset.fileName, message })
    }
    onProgress?.(i + 1, slice.length)
  }

  return { uploaded, failures }
}

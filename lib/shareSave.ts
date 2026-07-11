import { createSave, findSaveByUrl, updateSave } from './db'
import { fetchOGMetadata } from './ai'

export type QuickShareResult = 'saved' | 'duplicate' | 'error'

export async function quickSaveSharedUrl(url: string): Promise<QuickShareResult> {
  const duplicate = await findSaveByUrl(url)
  if (duplicate) return 'duplicate'

  let title = url
  try {
    title = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    // keep raw url as title
  }

  const save = await createSave({
    url,
    title,
    type: 'link',
    tags: [],
    is_inbox: true,
  })

  if (!save) return 'error'

  void fetchOGMetadata(url)
    .then(metadata => updateSave(save.id, {
      title: metadata.title || title,
      description: metadata.description,
      image_url: metadata.image,
    }))
    .catch(() => {})

  return 'saved'
}

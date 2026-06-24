import { OrganizeSuggestion } from '../types'
import { updateSave, upsertCollectionByName } from './db'

// Files a batch of accepted AI suggestions: resolves each suggested collection
// name to an id (creating it if needed) and moves the save out of the inbox.
// Shared by the Inbox screen and the Library "Organize" banner.
export async function applyOrganizeSuggestions(accepted: OrganizeSuggestion[]): Promise<void> {
  await Promise.all(
    accepted.map(async suggestion => {
      let collectionId: string | undefined

      if (suggestion.suggested_collection && suggestion.suggested_collection !== 'Read Later') {
        const id = await upsertCollectionByName(suggestion.suggested_collection)
        collectionId = id ?? undefined
      }

      await updateSave(suggestion.save.id, {
        is_inbox: false,
        collection_id: collectionId,
        tags: suggestion.suggested_tags,
      })
    })
  )
}

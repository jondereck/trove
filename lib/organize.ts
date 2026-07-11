import { OrganizeSuggestion } from '../types'
import { updateSave, upsertCollectionByName, LimitReachedError } from './db'

// Files a batch of accepted AI suggestions: resolves each suggested collection
// name to an id (creating it if needed) and moves the save out of the inbox.
// Shared by the Inbox screen and the Library "Organize" banner.
//
// Free tier: when the collection cap blocks creating a suggested collection,
// the save still leaves the inbox (with its tags) but stays uncollected.
// Returns how many items hit the cap so callers can show an upgrade nudge.
export async function applyOrganizeSuggestions(accepted: OrganizeSuggestion[]): Promise<{ limited: number }> {
  let limited = 0

  await Promise.all(
    accepted.map(async suggestion => {
      let collectionId: string | undefined

      if (suggestion.suggested_collection && suggestion.suggested_collection !== 'Read Later') {
        try {
          const id = await upsertCollectionByName(suggestion.suggested_collection)
          collectionId = id ?? undefined
        } catch (e) {
          if (e instanceof LimitReachedError) limited++
          else throw e
        }
      }

      await updateSave(suggestion.save.id, {
        is_inbox: false,
        collection_id: collectionId,
        tags: suggestion.suggested_tags.length ? suggestion.suggested_tags : (suggestion.save.tags ?? []),
      })
    })
  )

  return { limited }
}

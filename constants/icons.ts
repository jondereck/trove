import type { Ionicons } from '@expo/vector-icons'

export type IoniconName = React.ComponentProps<typeof Ionicons>['name']

export const DEFAULT_COLLECTION_ICON: IoniconName = 'folder-outline'

// Curated set offered in the collection icon picker. Outline style to match the
// rest of the app's line-icon look.
export const COLLECTION_ICONS: IoniconName[] = [
  'folder-outline',
  'bookmark-outline',
  'color-palette-outline',
  'book-outline',
  'code-slash-outline',
  'bulb-outline',
  'restaurant-outline',
  'airplane-outline',
  'home-outline',
  'gift-outline',
  'musical-notes-outline',
  'camera-outline',
  'barbell-outline',
  'leaf-outline',
  'heart-outline',
  'briefcase-outline',
]

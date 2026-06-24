export type SaveType = 'link' | 'image' | 'video' | 'note'

export interface Save {
  id: string
  user_id: string
  url?: string
  title: string
  description?: string
  type: SaveType
  content?: string
  image_url?: string
  collection_id?: string
  tags: string[]
  is_inbox: boolean
  is_favorite?: boolean
  created_at: string
}

export interface Collection {
  id: string
  user_id: string
  name: string
  emoji: string
  color: string
  description?: string
  created_at: string
  save_count?: number
  cover_urls?: string[]
}

export interface OGMetadata {
  url: string
  title: string
  description?: string
  image?: string
  siteName?: string
}

export interface AISuggestion {
  collection: string
  tags: string[]
}

export interface OrganizeSuggestion {
  save: Save
  suggested_collection: string
  suggested_tags: string[]
  confidence: number
}

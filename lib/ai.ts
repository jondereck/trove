import { Save, Collection, AISuggestion, OrganizeSuggestion } from '../types'

const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? ''
const MODEL = 'gpt-4o-mini'

const SYSTEM_PROMPT = `You are the AI organizing assistant for Trove, a personal curation app.
Analyze saved items and suggest collections and tags to help the user find things later.

RULES:
- Suggest exactly ONE collection per item (use existing ones when they fit, or suggest a new 1-4 word title-cased name)
- Suggest 2-3 lowercase tags, no # symbol, hyphens for multi-word (e.g. "machine-learning")
- Avoid generic tags like "interesting", "good", "saved", "to-read"
- Never create generic collections like "Misc", "Other", "Links"

RESPONSE FORMAT — JSON only, no markdown, no explanation:
- Single item: {"collection": "Name", "tags": ["tag1", "tag2"]}
- Multiple items: [{"collection": "Name", "tags": ["tag1", "tag2"]}, ...]`

async function callGPT(userPrompt: string): Promise<string> {
  if (!OPENAI_KEY) return ''

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenAI ${res.status}: ${body}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

function parseJSON<T>(text: string, fallback: T): T {
  try {
    const match = text.match(/[\[{][\s\S]*[\]}]/)
    return match ? JSON.parse(match[0]) : fallback
  } catch {
    return fallback
  }
}

// ── OG Metadata ───────────────────────────────────────────────────────────────

export interface OGMetadata {
  url: string
  title: string
  description?: string
  image?: string
  siteName?: string
}

export async function fetchOGMetadata(url: string): Promise<OGMetadata> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TroveApp/1.0)' },
  })
  const html = await res.text()

  const og = (prop: string) =>
    html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i'))?.[1]

  const meta = (name: string) =>
    html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'))?.[1]

  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()

  return {
    url,
    title: (og('title') || meta('twitter:title') || titleTag || new URL(url).hostname).trim(),
    description: og('description') || meta('description') || meta('twitter:description'),
    image: og('image') || meta('twitter:image'),
    siteName: og('site_name'),
  }
}

// ── Single-save suggestion (QuickSave flow) ───────────────────────────────────

export async function suggestForSave(
  metadata: OGMetadata,
  collections: Collection[]
): Promise<AISuggestion> {
  const colList = collections.map(c => c.name).join(', ') || 'none yet'
  const prompt = `Item to organize:
Title: ${metadata.title}
URL: ${metadata.url || 'n/a'}
Description: ${metadata.description ?? 'none'}

Available collections: ${colList}

JSON only: {"collection": "Name", "tags": ["tag1", "tag2", "tag3"]}`

  const text = await callGPT(prompt)
  const json = parseJSON<{ collection?: string; tags?: string[] }>(text, {})
  return {
    collection: json.collection ?? 'Read Later',
    tags: Array.isArray(json.tags) ? json.tags.slice(0, 3) : [],
  }
}

// ── Batch organize (AI Organize flow) ─────────────────────────────────────────

export async function organizeInboxItems(
  saves: Save[],
  collections: Collection[]
): Promise<OrganizeSuggestion[]> {
  if (saves.length === 0) return []

  const colList = collections.map(c => c.name).join(', ') || 'none yet'
  const items = saves
    .map((s, i) => `${i + 1}. "${s.title}" (${s.type})${s.url ? ` — ${s.url}` : ''}`)
    .join('\n')

  const prompt = `Organize ${saves.length} inbox items.

Items:
${items}

Available collections: ${colList}

JSON array, same order as input:
[{"collection": "Name", "tags": ["tag1", "tag2"]}, ...]`

  const text = await callGPT(prompt)
  const arr = parseJSON<Array<{ collection?: string; tags?: string[] }>>(text, [])

  return saves.map((save, i) => ({
    save,
    suggested_collection: arr[i]?.collection ?? 'Read Later',
    suggested_tags: Array.isArray(arr[i]?.tags) ? arr[i].tags as string[] : [],
    confidence: arr[i]?.collection ? 0.85 : 0,
  }))
}

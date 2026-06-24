import { Save, Collection, OGMetadata, AISuggestion, OrganizeSuggestion } from '../types'
import { supabase } from './supabase'

// ⚠️  EXPO_PUBLIC_ vars are bundled into the app binary. When this key is set we
// call OpenAI directly (dev). Leave it unset in production builds and the call
// routes through the `ai-proxy` Edge Function instead, keeping the key server-side.
const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? ''
const MODEL = 'gpt-4o-mini'

const SYSTEM_PROMPT = `You are the AI organizing assistant for Trove, a personal curation and bookmarking app.

Your job is to analyze saved items and suggest appropriate collections and tags so users can find their saves later.

COLLECTION RULES:
- Suggest exactly ONE collection per item
- Prefer an existing collection from the provided list when it fits naturally
- Suggest a new collection name only when none of the existing ones fit — make it specific and noun-phrase (e.g. "Design Systems", "Python Tools", "Food & Recipes")
- Collection names should be title-cased and 1-4 words
- Do NOT create overly generic collections like "Misc", "Other", "Saved", "Links"

TAG RULES:
- Suggest 2-3 tags per item — never more, never fewer unless the item is too sparse to tag meaningfully
- Tags must be lowercase, no # symbol, no spaces (use hyphens for multi-word: "machine-learning", "open-source")
- Tags should be reusable across many items — prefer broad semantic terms over hyper-specific ones
- Good tags: "design", "productivity", "python", "machine-learning", "ux", "data", "finance", "health"
- Bad tags: "interesting", "good-article", "saved", "to-read", "cool"
- Infer tags from the item type, domain, title, and description

CONTENT INFERENCE:
- For link saves: use the domain name, title, and description to infer topic
- For note saves: tag based on the note's subject matter
- For image saves: infer from the title or URL context
- For video saves: use the title to determine topic

RESPONSE FORMAT:
- Single item: {"collection": "Collection Name", "tags": ["tag1", "tag2", "tag3"]}
- Multiple items: [{"collection": "Name", "tags": ["tag1", "tag2"]}, ...]
- Respond with VALID JSON ONLY — no explanation, no markdown code fences, no preamble, no trailing text
- For multiple items the array length MUST equal the number of input items, in the same order`

async function callAI(userPrompt: string): Promise<string> {
  // Dev path: direct call when a public key is bundled.
  if (OPENAI_KEY) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`OpenAI API ${res.status}: ${body}`)
    }

    const data = await res.json()
    return (data.choices?.[0]?.message?.content as string) ?? ''
  }

  // Prod path: proxy through the Edge Function so the key stays server-side.
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: { system: SYSTEM_PROMPT, user: userPrompt, max_tokens: 512 },
  })
  if (error) throw new Error(`ai-proxy: ${error.message}`)
  if (data?.error) throw new Error(`ai-proxy: ${data.error}`)
  return (data?.content as string) ?? ''
}

function parseJSON<T>(text: string, fallback: T): T {
  try {
    const match = text.match(/[\[{][\s\S]*[\]}]/)
    return match ? JSON.parse(match[0]) : fallback
  } catch {
    return fallback
  }
}

// ---------------------------------------------------------------------------
// OG metadata
// ---------------------------------------------------------------------------

// Aborts a fetch that takes too long so slow hosts (e.g. Facebook) can't hang
// the "Analyzing" step indefinitely.
async function fetchWithTimeout(input: string, init: RequestInit = {}, ms = 8000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Server-side scrape via the og-scrape Edge Function (real browser/crawler UA).
// Returns null if the function isn't deployed or yields nothing, so the caller
// can fall back to a direct fetch.
async function scrapeViaEdge(url: string): Promise<OGMetadata | null> {
  try {
    const { data, error } = await supabase.functions.invoke('og-scrape', { body: { url } })
    if (error || !data || data.error) return null
    if (!data.title && !data.image) return null
    return {
      url,
      title: data.title ?? url,
      description: data.description ?? undefined,
      image: data.image ?? undefined,
      siteName: data.siteName ?? undefined,
    }
  } catch {
    return null
  }
}

// oEmbed gives reliable thumbnails/titles for providers whose pages are
// JS-rendered or bot-gated (TikTok, YouTube) and don't expose og: tags to a
// plain fetch.
async function fetchOEmbed(endpoint: string, url: string): Promise<OGMetadata | null> {
  try {
    const res = await fetchWithTimeout(endpoint, {}, 7000)
    if (!res.ok) return null
    const j = await res.json()
    if (!j?.title && !j?.thumbnail_url) return null
    return {
      url,
      title: (j.title ?? new URL(url).hostname).trim(),
      description: j.author_name ? `by ${j.author_name}` : undefined,
      image: j.thumbnail_url,
      siteName: j.provider_name,
    }
  } catch {
    return null
  }
}

export async function fetchOGMetadata(url: string): Promise<OGMetadata> {
  let host = ''
  try { host = new URL(url).hostname.replace(/^www\./, '') } catch { /* keep raw url */ }

  // Provider-specific oEmbed first (thumbnails these sites hide from scrapers).
  if (host.includes('tiktok.com')) {
    const m = await fetchOEmbed(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, url)
    if (m) return m
  }
  if (host.includes('youtube.com') || host.includes('youtu.be')) {
    const m = await fetchOEmbed(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, url)
    if (m) return m
  }

  // Prefer the server-side scraper (better UA, gets public FB/IG thumbnails).
  const viaEdge = await scrapeViaEdge(url)
  if (viaEdge) return viaEdge

  // Fallback: direct Open Graph scrape, with a timeout + graceful fallback.
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TroveApp/1.0)' },
    }, 8000)
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
      title: (og('title') || meta('twitter:title') || titleTag || host || url).trim(),
      description: og('description') || meta('description') || meta('twitter:description'),
      image: og('image') || meta('twitter:image'),
      siteName: og('site_name'),
    }
  } catch {
    // Timeout or network error — still let the user save with a sane title.
    return { url, title: host || url }
  }
}

// ---------------------------------------------------------------------------
// Single-save suggestion (QuickSave flow)
// ---------------------------------------------------------------------------

export async function suggestForSave(
  metadata: OGMetadata,
  collections: Collection[]
): Promise<AISuggestion> {
  const colList = collections.map(c => c.name).join(', ') || 'none yet'

  const prompt = `Analyze this saved item and suggest organization.

Title: ${metadata.title}
URL: ${metadata.url}
Description: ${metadata.description ?? 'none'}
Site name: ${metadata.siteName ?? ''}

Available collections: ${colList}

Respond with JSON only: {"collection": "Name", "tags": ["tag1", "tag2", "tag3"]}`

  const text = await callAI(prompt)
  const json = parseJSON<{ collection?: string; tags?: string[] }>(text, {})
  return {
    collection: json.collection ?? 'Read Later',
    tags: Array.isArray(json.tags) ? json.tags.slice(0, 3) : [],
  }
}

// ---------------------------------------------------------------------------
// Batch organize (Inbox AI Organize flow)
// ---------------------------------------------------------------------------

export async function organizeInboxItems(
  saves: Save[],
  collections: Collection[]
): Promise<OrganizeSuggestion[]> {
  if (saves.length === 0) return []

  const colList = collections.map(c => c.name).join(', ') || 'none yet'
  const items = saves
    .map((s, i) => `${i + 1}. "${s.title}" (${s.type})${s.url ? ` — ${s.url}` : ''}`)
    .join('\n')

  const prompt = `Organize these ${saves.length} items from a user's inbox.

Items (in order):
${items}

Available collections: ${colList}

Respond with a JSON array, one entry per item, in the SAME ORDER as the input:
[{"collection": "Name", "tags": ["tag1", "tag2"]}, ...]`

  const text = await callAI(prompt)
  const arr = parseJSON<Array<{ collection?: string; tags?: string[] }>>(text, [])

  return saves.map((save, i) => ({
    save,
    suggested_collection: arr[i]?.collection ?? 'Read Later',
    suggested_tags: Array.isArray(arr[i]?.tags) ? arr[i].tags as string[] : [],
    confidence: arr[i]?.collection ? 0.85 : 0,
  }))
}

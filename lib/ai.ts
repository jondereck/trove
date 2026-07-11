import { Save, Collection, AISuggestion, OrganizeSuggestion } from '../types'
import { getSettings } from './settings'
import { getUserId } from './session'
import { getInstallId, getTier } from './entitlements'
import { AiLimitError, incrementAiUsage, isAiCapReached } from './aiUsage'
import { showUpgradeAlert } from './upgradeAlert'

const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? ''
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''
const MODEL = 'gpt-4o-mini'

// Show the AI-limit upgrade nudge at most once per app session so hitting the
// cap doesn't spam an alert on every save.
let nudgedThisSession = false
function nudgeAiLimit() {
  if (nudgedThisSession) return
  nudgedThisSession = true
  const upgradeHint = getTier() === 'free'
    ? 'Unlock Trove or add Cloud for more.'
    : 'Add Trove Cloud for a bigger monthly allowance.'
  showUpgradeAlert(
    'AI limit reached',
    `You've used this month's AI suggestions on your plan. Saves still work — they'll land in your Inbox. ${upgradeHint}`
  )
}

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

// Dev builds with EXPO_PUBLIC_OPENAI_API_KEY call OpenAI directly. Release
// builds leave it unset so all users (guest + signed-in) route through ai-proxy
// with the anon key — same pattern as fetch-og.
//
// Monthly AI caps: checked locally first (fast fail), then enforced
// authoritatively by ai-proxy which returns 429 when the meter is exhausted.
async function callGPT(userPrompt: string): Promise<string> {
  if (await isAiCapReached()) throw new AiLimitError()

  if (!OPENAI_KEY) {
    const installId = await getInstallId()
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        system: SYSTEM_PROMPT,
        user: userPrompt,
        max_tokens: 512,
        user_id: getUserId(),
        install_id: installId,
      }),
    })
    if (res.status === 429) throw new AiLimitError()
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`ai-proxy ${res.status}: ${body}`)
    }
    const data = await res.json()
    await incrementAiUsage()
    return data?.content ?? ''
  }

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
  await incrementAiUsage()
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

// ── Note title suggestion ─────────────────────────────────────────────────────

export async function suggestNoteTitle(content: string): Promise<string> {
  const { aiSuggestTitleDescription } = await getSettings()
  if (!aiSuggestTitleDescription) return ''

  const prompt = `Give this note a short, descriptive title — max 8 words, title case, no quotes, no punctuation at the end:

"${content.slice(0, 600)}"

Reply with just the title, nothing else.`

  let text = ''
  try {
    text = await callGPT(prompt)
  } catch (e) {
    if (e instanceof AiLimitError) {
      nudgeAiLimit()
      return ''
    }
    throw e
  }
  return text.trim().replace(/^["']|["']$/g, '') || ''
}

// ── OG Metadata ───────────────────────────────────────────────────────────────

export interface OGMetadata {
  url: string
  title: string
  description?: string
  image?: string
  siteName?: string
}

// Routes through a Supabase Edge Function so server-side fetching bypasses
// CORS restrictions and bot-blocking (TikTok, Instagram, etc.)
export async function fetchOGMetadata(url: string): Promise<OGMetadata> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-og`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ url }),
  })

  if (!res.ok) throw new Error(`fetch-og ${res.status}`)

  const data = await res.json()
  return {
    url: data.url ?? url,
    title: data.title ?? new URL(url).hostname,
    description: data.description ?? undefined,
    image: data.image ?? undefined,
    siteName: data.siteName ?? undefined,
  }
}

// ── Single-save suggestion (QuickSave flow) ───────────────────────────────────

export async function suggestForSave(
  metadata: OGMetadata,
  collections: Collection[]
): Promise<AISuggestion> {
  const { aiSuggestTags, aiSuggestCollections } = await getSettings()
  // Both off → skip the model entirely and return inert defaults.
  if (!aiSuggestTags && !aiSuggestCollections) {
    return { collection: 'Read Later', tags: [] }
  }

  const colList = collections.map(c => c.name).join(', ') || 'none yet'
  const prompt = `Item to organize:
Title: ${metadata.title}
URL: ${metadata.url || 'n/a'}
Description: ${metadata.description ?? 'none'}

Available collections: ${colList}

JSON only: {"collection": "Name", "tags": ["tag1", "tag2", "tag3"]}`

  let text = ''
  try {
    text = await callGPT(prompt)
  } catch (e) {
    if (e instanceof AiLimitError) {
      nudgeAiLimit()
      return { collection: 'Read Later', tags: [] }
    }
    throw e
  }
  const json = parseJSON<{ collection?: string; tags?: string[] }>(text, {})
  return {
    collection: aiSuggestCollections ? (json.collection ?? 'Read Later') : 'Read Later',
    tags: aiSuggestTags ? [...new Set(Array.isArray(json.tags) ? json.tags.slice(0, 3) : [])] : [],
  }
}

// ── Batch organize (AI Organize flow) ─────────────────────────────────────────

export async function organizeInboxItems(
  saves: Save[],
  collections: Collection[]
): Promise<OrganizeSuggestion[]> {
  if (saves.length === 0) return []

  const { aiSuggestTags, aiSuggestCollections } = await getSettings()
  if (!aiSuggestTags && !aiSuggestCollections) {
    return saves.map(save => ({
      save,
      suggested_collection: 'Read Later',
      suggested_tags: [],
      confidence: 0,
    }))
  }

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

  let text = ''
  try {
    text = await callGPT(prompt)
  } catch (e) {
    if (e instanceof AiLimitError) {
      nudgeAiLimit()
      return saves.map(save => ({
        save,
        suggested_collection: 'Read Later',
        suggested_tags: [],
        confidence: 0,
      }))
    }
    throw e
  }
  const arr = parseJSON<Array<{ collection?: string; tags?: string[] }>>(text, [])

  return saves.map((save, i) => {
    const collection = aiSuggestCollections ? (arr[i]?.collection ?? 'Read Later') : 'Read Later'
    return {
      save,
      suggested_collection: collection,
      suggested_tags: aiSuggestTags
        ? [...new Set(Array.isArray(arr[i]?.tags) ? (arr[i].tags as string[]) : [])]
        : [],
      confidence: aiSuggestCollections && arr[i]?.collection ? 0.85 : 0,
    }
  })
}

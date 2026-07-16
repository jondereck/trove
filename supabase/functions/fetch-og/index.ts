import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const UA_FBCRAWLER = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
const UA_GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

type PreviewMetadata = {
  url: string
  title: string
  description: string | null
  image: string | null
  siteName: string
}

function pickUA(url: string): string {
  const host = new URL(url).hostname
  if (host.includes('facebook') || host.includes('fb.com') || host.includes('fb.watch')) return UA_FBCRAWLER
  if (host.includes('instagram') || host.includes('threads.net')) return UA_FBCRAWLER
  if (host.includes('tiktok')) return UA_GOOGLEBOT
  return UA_IPHONE
}

// Decode HTML entities: &amp; &#064; &#x40; etc.
function decode(s: string | null): string | null {
  if (!s) return null
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .trim()
}

function og(html: string, prop: string): string | null {
  return decode(
    html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"'<>]+)["']`, 'i'))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"'<>]+)["'][^>]+property=["']og:${prop}["']`, 'i'))?.[1] ??
    null
  )
}

function meta(html: string, name: string): string | null {
  return decode(
    html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"'<>]+)["']`, 'i'))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"'<>]+)["'][^>]+name=["']${name}["']`, 'i'))?.[1] ??
    null
  )
}

// TikTok buries the caption in JSON-LD — og:description is usually empty
function extractJsonLd(html: string): { title?: string; description?: string; image?: string } {
  try {
    const block = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)?.[1]
    if (!block) return {}
    const data = JSON.parse(block)
    const obj = Array.isArray(data) ? data[0] : data
    return {
      title: obj?.name ?? obj?.headline ?? undefined,
      description: obj?.description ?? undefined,
      image: obj?.thumbnailUrl ?? obj?.image?.url ?? obj?.image ?? undefined,
    }
  } catch {
    return {}
  }
}

async function fetchTikTokOEmbed(url: string): Promise<PreviewMetadata | null> {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null

    const data = await res.json()
    const title = typeof data?.title === 'string' ? data.title.trim() : ''
    const image = typeof data?.thumbnail_url === 'string' ? data.thumbnail_url : null
    if (!title && !image) return null

    const author = typeof data?.author_name === 'string' ? data.author_name.trim() : ''
    return {
      url,
      title: title || 'TikTok video',
      description: author ? `By ${author}` : null,
      image,
      siteName: 'TikTok',
    }
  } catch {
    return null
  }
}

function isYouTubeHost(host: string): boolean {
  const h = host.replace(/^www\./, '').toLowerCase()
  return h === 'youtube.com' || h === 'm.youtube.com' || h === 'youtu.be' || h.endsWith('.youtube.com')
}

async function fetchYouTubeOEmbed(url: string): Promise<PreviewMetadata | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null

    const data = await res.json()
    const title = typeof data?.title === 'string' ? data.title.trim() : ''
    const image = typeof data?.thumbnail_url === 'string' ? data.thumbnail_url : null
    if (!title && !image) return null

    const author = typeof data?.author_name === 'string' ? data.author_name.trim() : ''
    return {
      url,
      title: title || 'YouTube video',
      description: author ? `By ${author}` : null,
      image,
      siteName: 'YouTube',
    }
  } catch {
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { url } = await req.json()
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'url required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const host = new URL(url).hostname
    const isTikTok = host.includes('tiktok')
    const isYouTube = isYouTubeHost(host)
    const oembedMetadata = isTikTok
      ? await fetchTikTokOEmbed(url)
      : isYouTube
        ? await fetchYouTubeOEmbed(url)
        : null

    if (oembedMetadata?.title && oembedMetadata.image) {
      return new Response(JSON.stringify(oembedMetadata), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    let res: Response
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent': pickUA(url),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      })
    } catch (error) {
      if (oembedMetadata) {
        return new Response(JSON.stringify(oembedMetadata), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      throw error
    }
    if (!res.ok) {
      if (oembedMetadata) {
        return new Response(JSON.stringify(oembedMetadata), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`upstream ${res.status}`)
    }

    const html = await res.text()
    const hostname = host.replace(/^www\./, '')
    const titleTag = decode(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null)

    const jsonLd = isTikTok ? extractJsonLd(html) : {}

    let result: PreviewMetadata = {
      url,
      title: oembedMetadata?.title ?? og(html, 'title') ?? meta(html, 'twitter:title') ?? jsonLd.title ?? titleTag ?? hostname,
      description: oembedMetadata?.description ?? og(html, 'description') ?? meta(html, 'description') ?? meta(html, 'twitter:description') ?? jsonLd.description ?? null,
      image: oembedMetadata?.image ?? og(html, 'image') ?? meta(html, 'twitter:image') ?? jsonLd.image ?? null,
      siteName: oembedMetadata?.siteName ?? og(html, 'site_name') ?? hostname,
    }

    // Meta (Facebook/Instagram) increasingly serves a generic login-wall page
    // instead of the real og: tags to non-residential IPs, even with the
    // crawler UA. That page still has *some* meta tags, so it looks like a
    // success — but the title/description are about logging in, not the
    // shared content. Detect it and fall back to "no metadata" so the app
    // shows the bare URL instead of a misleading "Login • Instagram" card.
    const isLoginWall =
      /^Log ?in/i.test(result.title) ||
      /welcome back to instagram|log in to (see|check out)|you must log in/i.test(result.description ?? '')
    if (isLoginWall) {
      result = { url, title: hostname, description: null, image: null, siteName: hostname }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})

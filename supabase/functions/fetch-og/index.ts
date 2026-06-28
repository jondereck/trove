import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const UA_FBCRAWLER = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
const UA_GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

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

    const res = await fetch(url, {
      headers: {
        'User-Agent': pickUA(url),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })

    const html = await res.text()
    const hostname = host.replace(/^www\./, '')
    const titleTag = decode(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null)

    const jsonLd = isTikTok ? extractJsonLd(html) : {}

    const result = {
      url,
      title: og(html, 'title') ?? meta(html, 'twitter:title') ?? jsonLd.title ?? titleTag ?? hostname,
      description: og(html, 'description') ?? meta(html, 'description') ?? meta(html, 'twitter:description') ?? jsonLd.description ?? null,
      image: og(html, 'image') ?? meta(html, 'twitter:image') ?? jsonLd.image ?? null,
      siteName: og(html, 'site_name') ?? hostname,
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

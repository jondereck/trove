// Trove OG scraper — fetches Open Graph metadata server-side with a real
// browser / crawler User-Agent, so sites that gate og: tags behind a proper
// UA (e.g. Facebook public pages) return thumbnails the in-app fetch can't get.
//
// Deploy: supabase functions deploy og-scrape

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// Facebook/Instagram serve share metadata to their own crawler UA; everything
// else gets a normal desktop browser UA.
function pickUserAgent(url: string): string {
  try {
    const h = new URL(url).hostname
    if (h.includes('facebook.') || h.includes('instagram.') || h.includes('fb.watch')) {
      return 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
    }
  } catch { /* fall through */ }
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { url } = await req.json()
    if (!url) return json({ error: 'Missing "url"' }, 400)

    const res = await fetch(url, {
      headers: {
        'User-Agent': pickUserAgent(url),
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
    const html = await res.text()

    const og = (prop: string) =>
      html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i'))?.[1]

    const meta = (name: string) =>
      html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'))?.[1]

    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
    let host = ''
    try { host = new URL(url).hostname.replace(/^www\./, '') } catch { /* ignore */ }

    return json({
      url,
      title: (og('title') || meta('twitter:title') || titleTag || host || url).trim(),
      description: og('description') || meta('description') || meta('twitter:description') || null,
      image: og('image') || meta('twitter:image') || null,
      siteName: og('site_name') || null,
    })
  } catch (e) {
    return json({ error: String(e) }, 502)
  }
})

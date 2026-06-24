// Query params that are tracking noise — stripped so the same link with
// different campaign tags is treated as one save.
const STRIP_PARAMS = new Set([
  'fbclid', 'gclid', 'igshid', 'si', 'ref', 'ref_src', 'ref_url',
  'mc_eid', 'mc_cid', 'spm', '_ga', 'yclid', 'dclid', 'mkt_tok',
])

// Canonicalizes a URL for storage + dedup: lowercases the host, drops `www.`,
// removes the fragment + tracking params, and trims a trailing slash.
// Returns the trimmed input unchanged if it can't be parsed.
export function normalizeUrl(raw: string): string {
  const input = raw.trim()
  try {
    const u = new URL(input)
    u.hash = ''
    u.hostname = u.hostname.replace(/^www\./, '').toLowerCase()

    for (const key of [...u.searchParams.keys()]) {
      const k = key.toLowerCase()
      if (k.startsWith('utm_') || STRIP_PARAMS.has(k)) u.searchParams.delete(key)
    }

    let path = u.pathname
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)

    const search = u.searchParams.toString()
    return `${u.protocol}//${u.hostname}${path}${search ? `?${search}` : ''}`
  } catch {
    return input
  }
}

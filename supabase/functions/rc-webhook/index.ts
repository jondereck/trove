// RevenueCat webhook → entitlements table.
//
// Deploy:   supabase functions deploy rc-webhook --no-verify-jwt
// Secrets:  supabase secrets set RC_WEBHOOK_SECRET=<random string>
//           supabase secrets set RC_API_KEY=<RevenueCat secret API key (sk_...)>
//
// RevenueCat dashboard → Integrations → Webhooks: point at this function's URL
// and set the Authorization header to the same RC_WEBHOOK_SECRET value.
//
// Rather than deriving state from each event type, every event triggers a
// lookup of the customer's current subscriber info from the RevenueCat REST
// API — that is authoritative for which entitlements are active right now.
// The computed tier is stored for the app_user_id and all known aliases so
// the ai-proxy can resolve it from either the install id or the Supabase uid.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const RC_WEBHOOK_SECRET = Deno.env.get('RC_WEBHOOK_SECRET') ?? ''
const RC_API_KEY = Deno.env.get('RC_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const ENTITLEMENT_CLOUD = 'cloud'
const ENTITLEMENT_UNLOCKED = 'unlocked'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function fetchTier(appUserId: string): Promise<'free' | 'unlocked' | 'cloud'> {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
    { headers: { Authorization: `Bearer ${RC_API_KEY}` } }
  )
  if (!res.ok) throw new Error(`RevenueCat API ${res.status}`)
  const data = await res.json()
  const entitlements = data?.subscriber?.entitlements ?? {}
  const now = Date.now()
  const isActive = (key: string) => {
    const ent = entitlements[key]
    if (!ent) return false
    // Lifetime purchases have no expires_date.
    return !ent.expires_date || new Date(ent.expires_date).getTime() > now
  }
  if (isActive(ENTITLEMENT_CLOUD)) return 'cloud'
  if (isActive(ENTITLEMENT_UNLOCKED)) return 'unlocked'
  return 'free'
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  if (!RC_WEBHOOK_SECRET || req.headers.get('authorization') !== RC_WEBHOOK_SECRET) {
    return json({ error: 'Unauthorized' }, 401)
  }
  if (!RC_API_KEY || !SERVICE_ROLE_KEY) {
    return json({ error: 'Function secrets not configured' }, 500)
  }

  try {
    const { event } = await req.json()
    const appUserId: string | undefined = event?.app_user_id
    if (!appUserId) return json({ error: 'Missing app_user_id' }, 400)

    const tier = await fetchTier(appUserId)

    // Store under the primary id plus every alias (install id, Supabase uid)
    // so the ai-proxy can match whichever id the client sends.
    const ids = new Set<string>([appUserId, ...((event?.aliases as string[]) ?? [])])
    const rows = [...ids].map(id => ({
      app_user_id: id,
      tier,
      updated_at: new Date().toISOString(),
    }))

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { error } = await supabase.from('entitlements').upsert(rows)
    if (error) throw new Error(error.message)

    return json({ ok: true, tier, ids: rows.length })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

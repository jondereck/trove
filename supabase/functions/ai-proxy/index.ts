// Trove AI proxy — keeps the OpenAI key server-side and meters usage.
//
// Deploy:   supabase functions deploy ai-proxy --no-verify-jwt
// Secrets:  supabase secrets set OPENAI_API_KEY=sk-...
//           (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected)
//
// The client (lib/ai.ts) calls this via fetch + anon key when
// EXPO_PUBLIC_OPENAI_API_KEY is NOT set. Deployed with --no-verify-jwt so
// guests can use AI without signing in.
//
// Metering: the client sends install_id (stable per device) and user_id
// (Supabase uid when signed in). Tier comes from the entitlements table
// (written by the rc-webhook function); usage is counted per calendar month
// in ai_usage. When the tier's cap is exhausted this returns
// 429 { error: 'limit', tier, used, cap } and the client shows the upgrade
// nudge. Requests without any id are rejected — pre-metering clients must
// update. Metering failures (tables missing, etc.) fail open so a config
// mistake never bricks AI for paying users.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const MODEL = 'gpt-4o-mini'

// Must match AI_MONTHLY_CAP in constants/limits.ts.
const CAPS: Record<string, number> = { free: 25, unlocked: 300, cloud: 1000 }

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

type Meter =
  | { allowed: true }
  | { allowed: false; tier: string; used: number; cap: number }

async function checkAndMeter(userId: string | null, installId: string | null): Promise<Meter> {
  const ids = [userId, installId].filter((v): v is string => !!v)
  if (!ids.length || !SERVICE_ROLE_KEY) return { allowed: true }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Highest tier across both ids (purchase may be keyed to either).
    const { data: ents } = await supabase
      .from('entitlements')
      .select('tier')
      .in('app_user_id', ids)
    const tiers = new Set((ents ?? []).map(e => e.tier))
    const tier = tiers.has('cloud') ? 'cloud' : tiers.has('unlocked') ? 'unlocked' : 'free'
    const cap = CAPS[tier] ?? CAPS.free

    // Meter on the account id when present so usage follows sign-in across
    // devices; guests meter on the install id.
    const meterKey = userId ?? installId!
    const month = new Date().toISOString().slice(0, 7)
    const { data: count, error } = await supabase.rpc('increment_ai_usage', {
      p_app_user_id: meterKey,
      p_month: month,
    })
    if (error) throw new Error(error.message)

    if (typeof count === 'number' && count > cap) {
      return { allowed: false, tier, used: count, cap }
    }
    return { allowed: true }
  } catch {
    // Fail open: metering infrastructure problems shouldn't block AI.
    return { allowed: true }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!OPENAI_KEY) return json({ error: 'OPENAI_API_KEY not configured' }, 500)

  try {
    const { system, user, max_tokens = 512, user_id = null, install_id = null } = await req.json()
    if (!user) return json({ error: 'Missing "user" prompt' }, 400)
    if (!user_id && !install_id) return json({ error: 'Missing client id' }, 400)

    const meter = await checkAndMeter(user_id, install_id)
    if (!meter.allowed) {
      return json({ error: 'limit', tier: meter.tier, used: meter.used, cap: meter.cap }, 429)
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: user },
        ],
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      return json({ error: `OpenAI ${res.status}: ${body}` }, 502)
    }

    const data = await res.json()
    return json({ content: data.choices?.[0]?.message?.content ?? '' })
  } catch (e) {
    return json({ error: String(e) }, 400)
  }
})

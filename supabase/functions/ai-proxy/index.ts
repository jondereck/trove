// Trove AI proxy — keeps the OpenAI key server-side.
//
// Deploy:   supabase functions deploy ai-proxy
// Secret:   supabase secrets set OPENAI_API_KEY=sk-...
//
// The client (lib/ai.ts) calls this via supabase.functions.invoke('ai-proxy', …)
// only when EXPO_PUBLIC_OPENAI_API_KEY is NOT set in the app build, so the key
// never ships inside the binary. Requests carry the user's JWT (verify_jwt
// defaults to true), so only signed-in users can reach it.

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? ''
const MODEL = 'gpt-4o-mini'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!OPENAI_KEY) return json({ error: 'OPENAI_API_KEY not configured' }, 500)

  try {
    const { system, user, max_tokens = 512 } = await req.json()
    if (!user) return json({ error: 'Missing "user" prompt' }, 400)

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

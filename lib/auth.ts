import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { supabase } from './supabase'
import { fetchProfile, updateProfile } from './cloudDb'
import { namesFromUserMetadata } from './profileCache'

// Auth helpers shared by the (auth) screens and the account page.
//
// OAuth uses the browser-based PKCE flow: Supabase builds the provider URL,
// we open it in an auth session, and exchange the returned `code` for a
// session. The session lands on the supabase client, so the root layout's
// onAuthStateChange picks it up (redirect + local→cloud migration).

WebBrowser.maybeCompleteAuthSession()

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const redirectTo = Linking.createURL('/')

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  })
  if (error) return { error: error.message }
  if (!data?.url) return { error: 'Could not start Google sign-in.' }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
  if (result.type !== 'success') {
    // User dismissed the browser — not an error worth surfacing.
    return { error: null }
  }

  const { queryParams } = Linking.parse(result.url)
  const code = queryParams?.code
  if (typeof code !== 'string') {
    return { error: 'Google sign-in did not return a session.' }
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  return { error: exchangeError?.message ?? null }
}

export async function sendPasswordReset(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: Linking.createURL('/change-password'),
  })
  return { error: error?.message ?? null }
}

// After an OAuth sign-in, copy the provider's name/photo into the profiles row.
// Only fills blanks — never overwrites a name or avatar the user set themselves.
export async function syncProviderProfile(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const meta = user.user_metadata ?? {}
  const profile = await fetchProfile()

  const updates: { first_name?: string; last_name?: string; avatar_url?: string } = {}

  const { first: metaFirst, last: metaLast } = namesFromUserMetadata(meta)
  // Fill each blank independently — previously skipped last_name when first_name existed.
  if (!profile?.first_name?.trim() && metaFirst) updates.first_name = metaFirst
  if (!profile?.last_name?.trim() && metaLast) updates.last_name = metaLast

  if (!profile?.avatar_url) {
    const photo = meta.avatar_url ?? meta.picture
    if (typeof photo === 'string' && photo) updates.avatar_url = photo
  }

  if (Object.keys(updates).length) await updateProfile(updates)
}

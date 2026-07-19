import type { Profile } from './cloudDb'

type ProfileSnapshot = Pick<Profile, 'first_name' | 'last_name' | 'avatar_url'>

let snapshot: ProfileSnapshot | null = null

export function peekProfile(): ProfileSnapshot | null {
  return snapshot
}

export function cacheProfile(profile: Profile | null): void {
  if (!profile) return
  snapshot = {
    first_name: profile.first_name,
    last_name: profile.last_name,
    avatar_url: profile.avatar_url,
  }
}

export function clearProfileCache(): void {
  snapshot = null
}

export function namesFromUserMetadata(meta: Record<string, unknown> | null | undefined): {
  first: string
  last: string
} {
  const data = meta ?? {}
  const full = String(data.full_name ?? data.name ?? '').trim()
  const first = String(data.given_name ?? full.split(' ')[0] ?? '').trim()
  const last = String(data.family_name ?? full.split(' ').slice(1).join(' ') ?? '').trim()
  return { first, last }
}

export function formatProfileName(
  first: string | null | undefined,
  last: string | null | undefined,
  email?: string | null,
): string {
  const full = [first?.trim(), last?.trim()].filter(Boolean).join(' ')
  if (full) return full
  const local = email?.split('@')[0]?.trim()
  if (local) return local
  return 'Account'
}

// Onboarding visibility.
//
// The intro shows on every cold launch while the library is still empty and no
// user is signed in — once you've saved something (or logged in) it stops. To
// avoid bouncing back to the intro right after tapping "Get started", we keep an
// in-memory "dismissed for this session" flag. It is intentionally NOT persisted,
// so the next app launch shows the intro again if the library is still empty.

let dismissed = false
const listeners = new Set<() => void>()

export function isOnboardingDismissed(): boolean {
  return dismissed
}

export function dismissOnboarding(): void {
  dismissed = true
  listeners.forEach(l => l())
}

export function subscribeOnboarding(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

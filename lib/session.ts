import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Synchronously-readable mirror of the Supabase auth session.
//
// lib/db.ts routes each call to the cloud or local backend based on whether
// a user is signed in, and it needs that answer *synchronously* (without
// awaiting getSession on every query). This module keeps a cached copy that
// is hydrated on import and kept fresh via onAuthStateChange.

let cachedSession: Session | null = null

supabase.auth.getSession().then(({ data }) => {
  cachedSession = data.session
})

supabase.auth.onAuthStateChange((_event, session) => {
  cachedSession = session
})

export function isLoggedIn(): boolean {
  return cachedSession != null
}

export function getUserId(): string | null {
  return cachedSession?.user.id ?? null
}

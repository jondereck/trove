import { Platform } from 'react-native'
import Purchases, { CustomerInfo } from 'react-native-purchases'
import * as SecureStore from 'expo-secure-store'
import * as Crypto from 'expo-crypto'
import { Tier, ENTITLEMENT_CLOUD, ENTITLEMENT_UNLOCKED } from '../constants/limits'

// Synchronously-readable mirror of the RevenueCat entitlement state — same
// pattern as lib/session.ts. Hydrated once at startup (configurePurchases)
// and kept fresh via the CustomerInfo update listener, so limit checks in
// db.ts / ai.ts never need to await the SDK.
//
// Dev/testing: set EXPO_PUBLIC_FORCE_TIER=free|unlocked|cloud to override
// (purchases can't be tested until the app is uploaded to Play Console).

const FORCE_TIER = process.env.EXPO_PUBLIC_FORCE_TIER as Tier | undefined
const RC_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID ?? ''
const INSTALL_ID_KEY = 'trove.installId'

let cachedTier: Tier = FORCE_TIER ?? 'free'
let cachedInstallId: string | null = null
let configured = false
const listeners = new Set<(tier: Tier) => void>()

// Stable per-install UUID. Used as the RevenueCat app user ID for guests and
// as the metering key for the ai-proxy, so AI limits survive sign-in/out.
export async function getInstallId(): Promise<string> {
  if (cachedInstallId) return cachedInstallId
  try {
    let id = await SecureStore.getItemAsync(INSTALL_ID_KEY)
    if (!id) {
      id = Crypto.randomUUID()
      await SecureStore.setItemAsync(INSTALL_ID_KEY, id)
    }
    cachedInstallId = id
    return id
  } catch {
    // SecureStore unavailable (e.g. web preview) — fall back to an in-memory id.
    cachedInstallId = cachedInstallId ?? Crypto.randomUUID()
    return cachedInstallId
  }
}

function tierFromCustomerInfo(info: CustomerInfo): Tier {
  const active = info.entitlements.active
  if (active[ENTITLEMENT_CLOUD]) return 'cloud'
  if (active[ENTITLEMENT_UNLOCKED]) return 'unlocked'
  return 'free'
}

function setTier(next: Tier) {
  const effective = FORCE_TIER ?? next
  if (effective === cachedTier) return
  cachedTier = effective
  listeners.forEach(fn => fn(effective))
}

/** Push RevenueCat CustomerInfo into the sync cache (e.g. right after purchase). */
export function applyCustomerInfo(info: CustomerInfo): Tier {
  setTier(tierFromCustomerInfo(info))
  return getTier()
}

// Call once from the root layout. Safe to call again (no-op).
export async function configurePurchases(): Promise<void> {
  if (configured || Platform.OS === 'web' || !RC_ANDROID_KEY) return
  try {
    const appUserID = await getInstallId()
    Purchases.configure({ apiKey: RC_ANDROID_KEY, appUserID })
    configured = true
    Purchases.addCustomerInfoUpdateListener(info => setTier(tierFromCustomerInfo(info)))
    const info = await Purchases.getCustomerInfo()
    setTier(tierFromCustomerInfo(info))
  } catch {
    // SDK unavailable (Expo Go preview mode quirks, missing native module).
    // Stay on the cached/forced tier rather than crashing startup.
  }
}

export function isPurchasesConfigured(): boolean {
  return configured
}

export function getTier(): Tier {
  return cachedTier
}

export function hasUnlocked(): boolean {
  return cachedTier === 'unlocked' || cachedTier === 'cloud'
}

export function hasCloud(): boolean {
  return cachedTier === 'cloud'
}

export function subscribeTier(fn: (tier: Tier) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Tie the RevenueCat identity to the Supabase account so purchases restore on
// any device the user signs into.
export async function logInPurchases(userId: string): Promise<void> {
  if (!configured) return
  try {
    const { customerInfo } = await Purchases.logIn(userId)
    setTier(tierFromCustomerInfo(customerInfo))
  } catch {
    // keep last known tier
  }
}

// On sign-out, switch back to the install id (not an anonymous id) so the
// device keeps a stable identity for AI metering and any device-scoped unlock.
export async function logOutPurchases(): Promise<void> {
  if (!configured) return
  try {
    const installId = await getInstallId()
    const { customerInfo } = await Purchases.logIn(installId)
    setTier(tierFromCustomerInfo(customerInfo))
  } catch {
    // keep last known tier
  }
}

export async function restorePurchases(): Promise<Tier> {
  if (!configured) return cachedTier
  try {
    const info = await Purchases.restorePurchases()
    setTier(tierFromCustomerInfo(info))
  } catch {
    // no-op — UI shows current tier
  }
  return cachedTier
}

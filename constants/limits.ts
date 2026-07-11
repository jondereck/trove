// Tier caps — single source of truth for limit enforcement and paywall copy.

export type Tier = 'free' | 'unlocked' | 'cloud'

export const FREE_SAVE_CAP = 100
export const FREE_COLLECTION_CAP = 5
export const FREE_IMPORT_CAP = 50

// Monthly AI action caps per tier. "Unlocked" is presented as unlimited for
// everyday use; the cap is fair-use protection since the purchase is one-time
// but the OpenAI cost is recurring.
export const AI_MONTHLY_CAP: Record<Tier, number> = {
  free: 25,
  unlocked: 300,
  cloud: 1000,
}

export const PRICES = {
  unlockedOneTime: '₱200',
  cloudMonthly: '₱150/month',
  cloudYearly: '₱1,200/year',
}

// Store product / entitlement identifiers (must match Play Console + RevenueCat).
export const PRODUCT_UNLOCKED = 'trove_unlocked'
export const PRODUCT_CLOUD_MONTHLY = 'trove_cloud_monthly'
export const PRODUCT_CLOUD_YEARLY = 'trove_cloud_yearly'
export const ENTITLEMENT_UNLOCKED = 'unlocked'
export const ENTITLEMENT_CLOUD = 'cloud'

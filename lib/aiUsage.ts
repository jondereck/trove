import AsyncStorage from '@react-native-async-storage/async-storage'
import { AI_MONTHLY_CAP } from '../constants/limits'
import { getTier } from './entitlements'

// Client-side AI usage counter (per calendar month). This is the soft gate —
// the ai-proxy enforces the same caps server-side, so clearing app data only
// buys a fresh UI counter, not free AI calls.

const KEY = 'trove.aiUsage'

type Usage = { month: string; count: number }

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7) // YYYY-MM
}

async function load(): Promise<Usage> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as Usage) : null
    if (parsed && parsed.month === currentMonth()) return parsed
  } catch {
    // fall through to fresh counter
  }
  return { month: currentMonth(), count: 0 }
}

export async function getAiUsageCount(): Promise<number> {
  return (await load()).count
}

export async function isAiCapReached(): Promise<boolean> {
  const usage = await load()
  return usage.count >= AI_MONTHLY_CAP[getTier()]
}

export async function incrementAiUsage(): Promise<void> {
  const usage = await load()
  usage.count += 1
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(usage))
  } catch {
    // non-fatal — the server-side meter is authoritative
  }
}

export class AiLimitError extends Error {
  constructor() {
    super(`You've used this month's AI suggestions on your current plan.`)
    this.name = 'AiLimitError'
  }
}

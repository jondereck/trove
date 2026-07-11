import { BackHandler, Platform } from 'react-native'

export function extractSharedUrl(webUrl?: string | null, text?: string | null): string | null {
  const candidate = webUrl ?? text?.match(/https?:\/\/[^\s]+/i)?.[0]
  if (!candidate) return null

  try {
    const parsed = new URL(candidate.replace(/[),.;!?]+$/, ''))
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

export function exitAfterShare(): void {
  if (Platform.OS === 'android') BackHandler.exitApp()
}

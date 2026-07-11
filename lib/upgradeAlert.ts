import { Alert } from 'react-native'
import { router } from 'expo-router'
import { LimitReachedError } from './db'

// Shared limit-hit prompt: explains the cap and offers the upgrade screen.

export function isLimitError(e: unknown): e is LimitReachedError {
  return e instanceof LimitReachedError
}

export function showLimitAlert(err: LimitReachedError) {
  const title = err.kind === 'saves' ? 'Save limit reached' : 'Collection limit reached'
  showUpgradeAlert(title, `${err.message} Unlock Trove once and it's unlimited forever.`)
}

export function showUpgradeAlert(title: string, message: string) {
  Alert.alert(title, message, [
    { text: 'Not now', style: 'cancel' },
    { text: 'See plans', onPress: () => router.push('/upgrade') },
  ])
}

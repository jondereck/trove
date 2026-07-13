import { Alert } from 'react-native'
import { hasCloud } from './entitlements'
import { isLoggedIn } from './session'
import { requestAuthFlow } from './authNavigation'

export function canCreateAccount(): boolean {
  return hasCloud()
}

export function canOpenSignUp(): boolean {
  return hasCloud()
}

export function shouldPromptAccountForCloud(): boolean {
  return hasCloud() && !isLoggedIn()
}

type AuthRouter = {
  replace: (href: string) => void
  back?: () => void
}

/** Post-Cloud purchase/restore: invite guest to create or sign in for sync. */
export function showCloudAccountPrompt(router: AuthRouter, opts?: { onNotNow?: () => void }): void {
  Alert.alert(
    'Create an account to sync',
    'Trove Cloud is ready. Sign in or create an account so your library can sync across devices.',
    [
      {
        text: 'Not now',
        style: 'cancel',
        onPress: () => {
          if (opts?.onNotNow) opts.onNotNow()
          else router.back?.()
        },
      },
      {
        text: 'Sign in',
        onPress: () => {
          requestAuthFlow()
          router.replace('/(auth)/login')
        },
      },
      {
        text: 'Create account',
        onPress: () => {
          requestAuthFlow()
          router.replace('/(auth)/signup')
        },
      },
    ],
  )
}

import { useEffect, useState, useRef } from 'react'
import { Alert, AppState, Platform } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import * as Notifications from 'expo-notifications'
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent'
import type { Session } from '@supabase/supabase-js'
import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from '@expo-google-fonts/instrument-serif'
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk'
import {
  SplineSansMono_400Regular,
  SplineSansMono_500Medium,
} from '@expo-google-fonts/spline-sans-mono'
import { ThemeProvider, useTheme } from '../contexts/ThemeContext'
import { supabase } from '../lib/supabase'
import { isOnboardingDismissed, subscribeOnboarding } from '../lib/firstLaunch'
import { hasLocalData } from '../lib/localDb'
import { migrateLocalToCloud } from '../lib/migrateLocal'
import { clearLibraryCache } from '../lib/libraryCache'
import { syncProviderProfile } from '../lib/auth'
import {
  clearAuthFlow,
  clearCloudVerifyPending,
  consumeCloudVerifyPending,
  isAuthFlowRequested,
} from '../lib/authNavigation'
import { clearProfileCache } from '../lib/profileCache'
import { isLoggedIn } from '../lib/session'
import {
  configurePurchases,
  hasCloud,
  logInPurchases,
  logOutPurchases,
  restorePurchases,
  subscribeTier,
} from '../lib/entitlements'
import { syncAllDigestNotifications } from '../lib/notificationsSync'
import { recordNotification, syncPresentedNotifications } from '../lib/notificationLog'
import { setLibraryFilterIntent } from '../lib/libraryFilterIntent'
import { runAutoBackupIfDue } from '../lib/autoBackup'

SplashScreen.preventAutoHideAsync()

async function maybeMigrateToCloud() {
  if (!isLoggedIn() || !hasCloud()) return
  const has = await hasLocalData()
  if (!has) return
  const { saves, collections } = await migrateLocalToCloud()
  if (saves || collections) {
    Alert.alert('Synced to your account', `Moved ${saves} saves and ${collections} collections to the cloud.`)
  }
}

function maybeVerifyCloudAfterSignIn(router: ReturnType<typeof useRouter>) {
  if (!consumeCloudVerifyPending()) return
  if (hasCloud()) return

  Alert.alert(
    'No Cloud on this account',
    "You're signed in, but this account has no Trove Cloud subscription. Subscribe or restore purchases to sync across devices.",
    [
      { text: 'OK', style: 'cancel' },
      {
        text: 'Restore',
        onPress: () => {
          restorePurchases().then(tier => {
            if (tier === 'cloud') {
              maybeMigrateToCloud().catch(() => {})
              Alert.alert('Restored', 'Trove Cloud is active on this account.')
            } else {
              Alert.alert(
                'Nothing to restore',
                'No Cloud subscription was found for this store account. You can subscribe from Plans.',
                [
                  { text: 'OK', style: 'cancel' },
                  { text: 'See plans', onPress: () => router.push('/upgrade') },
                ],
              )
            }
          })
        },
      },
      { text: 'See plans', onPress: () => router.push('/upgrade') },
    ],
  )
}

interface RootNavigatorProps {
  session: Session | null | undefined
  hasData: boolean | undefined
  dismissed: boolean
  fontsLoaded: boolean
  fontError: Error | null
}

function RootNavigator({ session, hasData, dismissed, fontsLoaded, fontError }: RootNavigatorProps) {
  const { hasShareIntent } = useShareIntentContext()
  const segments = useSegments()
  const router = useRouter()
  const { colors, resolvedScheme } = useTheme()
  const handledNotification = useRef<string | null>(null)

  useEffect(() => {
    if (session === undefined || hasData === undefined) return
    if (!fontsLoaded && !fontError) return

    if (hasShareIntent) {
      if (segments[0] !== 'share') router.replace('/share')
      return
    }

    if (segments[0] === 'share') {
      router.replace('/(tabs)')
      return
    }

    const inAuthGroup = segments[0] === '(auth)'
    const inOnboarding = segments[0] === 'onboarding'

    // Signed-in users go straight to the app — never flash onboarding or auth intro.
    if (session) {
      if (inOnboarding || inAuthGroup) router.replace('/(tabs)')
      return
    }

    const showOnboarding = !hasData && !dismissed && !inAuthGroup
    if (showOnboarding) {
      if (!inOnboarding) router.replace('/onboarding')
      return
    }

    if (inOnboarding) {
      router.replace('/(tabs)')
    } else if (inAuthGroup && !isAuthFlowRequested()) {
      router.replace('/(tabs)')
    }
  }, [hasShareIntent, session, hasData, dismissed, fontsLoaded, fontError, segments, router])

  useEffect(() => {
    if (Platform.OS === 'web') return

    const openFromNotification = (response: Notifications.NotificationResponse | null) => {
      if (!response) return
      const id = `${response.notification.request.identifier}:${response.notification.date}`
      if (handledNotification.current === id) return
      void recordNotification(response.notification)
      const data = response.notification.request.content.data as { screen?: string } | undefined
      if (data?.screen === 'inbox') {
        handledNotification.current = id
        router.push('/(tabs)/inbox')
        return
      }
      if (data?.screen === 'library-unread') {
        handledNotification.current = id
        setLibraryFilterIntent('unread')
        router.push('/(tabs)')
      }
    }

    void Notifications.getLastNotificationResponseAsync().then(openFromNotification)
    const responseSub = Notifications.addNotificationResponseReceivedListener(openFromNotification)
    const receivedSub = Notifications.addNotificationReceivedListener(notification => {
      void recordNotification(notification)
    })
    return () => {
      responseSub.remove()
      receivedSub.remove()
    }
  }, [router])

  useEffect(() => {
    if (Platform.OS === 'web') return
    void syncAllDigestNotifications()
    void syncPresentedNotifications()
    void runAutoBackupIfDue().catch(() => {})
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void syncAllDigestNotifications()
        void syncPresentedNotifications()
        void runAutoBackupIfDue().catch(() => {})
      }
    })
    return () => sub.remove()
  }, [])

  return (
    <>
      <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="share" options={{ animation: 'fade' }} />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="save/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="collection/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="account" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="plan" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="change-password" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ai-preferences" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="appearance" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="notification-settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="backup-settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="upgrade" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </>
  )
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    SplineSansMono_400Regular,
    SplineSansMono_500Medium,
  })

  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [hasData, setHasData] = useState<boolean | undefined>(undefined)
  const [dismissed, setDismissed] = useState(isOnboardingDismissed())

  const router = useRouter()

  useEffect(() => {
    const resourcesReady =
      (fontsLoaded || fontError) &&
      session !== undefined &&
      hasData !== undefined
    if (resourcesReady) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, fontError, session, hasData])

  useEffect(() => {
    hasLocalData().then(setHasData)
    return subscribeOnboarding(() => setDismissed(isOnboardingDismissed()))
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (event === 'SIGNED_IN') {
        void clearLibraryCache()
        clearAuthFlow()
        syncProviderProfile()
        const linkThenMigrate = session?.user.id
          ? logInPurchases(session.user.id)
          : Promise.resolve()
        linkThenMigrate
          .then(() => maybeMigrateToCloud().catch(() => {}))
          .then(() => maybeVerifyCloudAfterSignIn(router))
      }
      if (event === 'SIGNED_OUT') {
        void clearLibraryCache()
        clearCloudVerifyPending()
        logOutPurchases()
        clearProfileCache()
      }
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/change-password')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  useEffect(() => {
    configurePurchases()
    return subscribeTier(tier => {
      if (tier === 'cloud') maybeMigrateToCloud().catch(() => {})
    })
  }, [])

  if ((!fontsLoaded && !fontError) || session === undefined || hasData === undefined) {
    return null
  }

  return (
    <ShareIntentProvider options={{ resetOnBackground: true }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <RootNavigator
            session={session}
            hasData={hasData}
            dismissed={dismissed}
            fontsLoaded={fontsLoaded}
            fontError={fontError}
          />
        </ThemeProvider>
      </SafeAreaProvider>
    </ShareIntentProvider>
  )
}

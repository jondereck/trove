import { useEffect, useState } from 'react'
import { Alert } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { ShareIntentProvider } from 'expo-share-intent'
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
import { COLORS } from '../constants/theme'
import { supabase } from '../lib/supabase'
import { isOnboardingDismissed, subscribeOnboarding } from '../lib/firstLaunch'
import { hasLocalData } from '../lib/localDb'
import { migrateLocalToCloud } from '../lib/migrateLocal'
import { syncProviderProfile } from '../lib/auth'
import { clearAuthFlow } from '../lib/authNavigation'
import { isLoggedIn } from '../lib/session'
import {
  configurePurchases,
  hasCloud,
  logInPurchases,
  logOutPurchases,
  subscribeTier,
} from '../lib/entitlements'

SplashScreen.preventAutoHideAsync()

// Local data lifts to the cloud only when the user is signed in AND has the
// Cloud subscription — signing in alone keeps data on-device.
async function maybeMigrateToCloud() {
  if (!isLoggedIn() || !hasCloud()) return
  const has = await hasLocalData()
  if (!has) return
  const { saves, collections } = await migrateLocalToCloud()
  if (saves || collections) {
    Alert.alert('Synced to your account', `Moved ${saves} saves and ${collections} collections to the cloud.`)
  }
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

  // undefined = still checking, null = no session, Session = logged in
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  // undefined = still checking the local store, boolean = known
  const [hasData, setHasData] = useState<boolean | undefined>(undefined)
  // In-memory: true once the intro is dismissed this session.
  const [dismissed, setDismissed] = useState(isOnboardingDismissed())

  const segments = useSegments()
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

  // Whether the device has any local saves/collections, kept in sync so
  // dismissing the intro updates routing without a redirect loop.
  useEffect(() => {
    hasLocalData().then(setHasData)
    return subscribeOnboarding(() => setDismissed(isOnboardingDismissed()))
  }, [])

  // Fetch initial session and subscribe to auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      // First sign-in: link purchases to the account, pull the provider's
      // name/photo into the profile, and (Cloud subscribers only) lift any
      // device-local saves into the cloud account.
      if (event === 'SIGNED_IN') {
        clearAuthFlow()
        syncProviderProfile()
        const linkThenMigrate = session?.user.id
          ? logInPurchases(session.user.id)
          : Promise.resolve()
        linkThenMigrate.then(() => maybeMigrateToCloud().catch(() => {}))
      }
      if (event === 'SIGNED_OUT') {
        logOutPurchases()
      }
      // Reset-email deep link: drop the user on the change-password screen.
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/change-password')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // RevenueCat: configure once, and when the Cloud entitlement is gained
  // (purchase or restore) migrate local data for signed-in users.
  useEffect(() => {
    configurePurchases()
    return subscribeTier(tier => {
      if (tier === 'cloud') maybeMigrateToCloud().catch(() => {})
    })
  }, [])

  // Routing: no forced login. Show the intro on every launch while the library
  // is empty and signed-out; otherwise land in the app.
  useEffect(() => {
    if (session === undefined || hasData === undefined) return // still loading
    if (!fontsLoaded && !fontError) return // fonts not ready

    const inAuthGroup = segments[0] === '(auth)'
    const inOnboarding = segments[0] === 'onboarding'

    // Don't force the intro over screens the user navigated to on purpose (the
    // auth flow), otherwise tapping "Sign in" from the intro bounces back.
    const showOnboarding = !session && !hasData && !dismissed && !inAuthGroup
    if (showOnboarding) {
      if (!inOnboarding) router.replace('/onboarding')
      return
    }

    // Has data, signed in, or intro dismissed — never sit on the intro/auth screens.
    if (inOnboarding) {
      router.replace('/(tabs)')
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)')
    }
  }, [session, hasData, dismissed, fontsLoaded, fontError, segments])

  // Hold render until fonts, session, and the local-store check are all known
  if ((!fontsLoaded && !fontError) || session === undefined || hasData === undefined) {
    return null
  }

  return (
    <ShareIntentProvider>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.bg } }}>
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="save/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="collection/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="account" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="change-password" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="ai-preferences" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="upgrade" options={{ animation: 'slide_from_bottom' }} />
        </Stack>
      </SafeAreaProvider>
    </ShareIntentProvider>
  )
}

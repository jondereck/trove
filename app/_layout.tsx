import { useEffect, useState } from 'react'
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

SplashScreen.preventAutoHideAsync()

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

  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, fontError])

  // Fetch initial session and subscribe to auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Redirect based on auth state
  useEffect(() => {
    if (session === undefined) return // still loading
    if (!fontsLoaded && !fontError) return // fonts not ready

    const inAuthGroup = segments[0] === '(auth)'

    if (!session && !inAuthGroup) {
      // Not logged in — go to welcome
      router.replace('/(auth)/')
    } else if (session && inAuthGroup) {
      // Logged in — go to app
      router.replace('/(tabs)')
    }
  }, [session, fontsLoaded, fontError, segments])

  // Hold render until fonts AND session check are done
  if ((!fontsLoaded && !fontError) || session === undefined) {
    return null
  }

  return (
    <ShareIntentProvider>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="save/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="collection/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="account" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="change-password" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="ai-preferences" options={{ animation: 'slide_from_right' }} />
        </Stack>
      </SafeAreaProvider>
    </ShareIntentProvider>
  )
}

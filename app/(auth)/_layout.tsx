import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Redirect, Stack } from 'expo-router'
import type { Session } from '@supabase/supabase-js'
import { useTheme } from '../../contexts/ThemeContext'
import { isAuthFlowRequested } from '../../lib/authNavigation'
import { supabase } from '../../lib/supabase'

function AuthStack() {
  const { colors } = useTheme()

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'fade',
      }}
    />
  )
}

function AuthBootLoader() {
  const { colors } = useTheme()
  return (
    <View style={[styles.loader, { backgroundColor: colors.bg }]}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  )
}

export default function AuthLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => {
      alive = false
      subscription.unsubscribe()
    }
  }, [])

  // Session still resolving — keep a loader, never flash login/signup chrome.
  if (session === undefined) {
    return <AuthBootLoader />
  }

  // Already signed in — leave auth without rendering the form stack.
  if (session) {
    return <Redirect href="/(tabs)" />
  }

  if (!isAuthFlowRequested()) {
    return <Redirect href="/(tabs)" />
  }

  return <AuthStack />
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})

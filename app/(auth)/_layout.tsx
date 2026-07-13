import { Redirect, Stack } from 'expo-router'
import { useTheme } from '../../contexts/ThemeContext'
import { isAuthFlowRequested } from '../../lib/authNavigation'

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

export default function AuthLayout() {
  if (!isAuthFlowRequested()) {
    return <Redirect href="/(tabs)" />
  }

  return <AuthStack />
}

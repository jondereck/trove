import { Redirect, Stack } from 'expo-router'
import { COLORS } from '../../constants/theme'
import { isAuthFlowRequested } from '../../lib/authNavigation'

export default function AuthLayout() {
  if (!isAuthFlowRequested()) {
    return <Redirect href="/(tabs)" />
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.bg },
        animation: 'fade',
      }}
    />
  )
}

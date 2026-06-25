import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { COLORS, FONTS } from '../constants/theme'

// accent (terracotta) → plum, matching the prototype's 140deg gradient.
const GRADIENT = [COLORS.accent, '#8a5a86'] as const

export default function Avatar({
  firstName,
  lastName,
  size = 44,
  ring = false,
}: {
  firstName?: string | null
  lastName?: string | null
  size?: number
  ring?: boolean
}) {
  const initials = (
    (firstName?.[0] ?? 'T') + (lastName?.[0] ?? '')
  ).toUpperCase()

  const circle = (
    <View style={styles.shadow}>
      <LinearGradient
        colors={GRADIENT}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.fill, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <Text style={[styles.initials, { fontSize: size * 0.42 }]}>{initials}</Text>
      </LinearGradient>
    </View>
  )

  // Ring = gradient avatar, a 2px canvas gap, then a 2px accent halo.
  if (!ring) return circle
  return (
    <View style={[styles.ring, { borderRadius: (size + 8) / 2 }]}>
      <View style={[styles.ringInner, { borderRadius: (size + 4) / 2 }]}>{circle}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: FONTS.serifItal, color: '#fff' },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  ring: { padding: 2, backgroundColor: COLORS.accent },
  ringInner: { padding: 2, backgroundColor: COLORS.bg },
})

import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { FONTS, SPACING } from '../constants/theme'
import { AppearanceMode } from '../lib/settings'
import { useTheme, useThemedStyles } from '../contexts/ThemeContext'

const OPTIONS: { id: AppearanceMode; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

export default function AppearanceScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors, appearance, setAppearance } = useTheme()
  const styles = useThemedStyles(c => StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.md,
      backgroundColor: c.bg,
    },
    backBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, paddingRight: SPACING.sm },
    topAction: { fontFamily: FONTS.sansSemi, fontSize: 15, color: c.accent },
    topTitle: { fontFamily: FONTS.sansBold, fontSize: 16, color: c.text },
    topSpacer: { width: 72 },
    intro: {
      fontFamily: FONTS.sans,
      fontSize: 14,
      lineHeight: 20,
      color: c.textSub,
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    groupTitle: {
      fontFamily: FONTS.mono,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.muted,
      marginHorizontal: SPACING.lg,
      marginBottom: 9,
    },
    card: {
      marginHorizontal: SPACING.lg,
      backgroundColor: c.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    segmentRow: { flexDirection: 'row', padding: 4, gap: 4 },
    segment: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: 'center',
    },
    segmentActive: { backgroundColor: c.accentSoft },
    segmentLabel: { fontFamily: FONTS.sansSemi, fontSize: 14, color: c.muted },
    segmentLabelActive: { color: c.accent },
    currentHint: {
      fontFamily: FONTS.sans,
      fontSize: 13,
      color: c.muted,
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.md,
    },
  }))

  const currentLabel = OPTIONS.find(o => o.id === appearance)?.label ?? 'System'

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color={colors.accent} />
          <Text style={styles.topAction}>Account</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Appearance</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: SPACING.lg, paddingBottom: insets.bottom + SPACING.xl * 2 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Match your device or switch between light and dark mode anytime.
        </Text>

        <Text style={styles.groupTitle}>Theme</Text>
        <View style={styles.card}>
          <View style={styles.segmentRow}>
            {OPTIONS.map(opt => {
              const active = appearance === opt.id
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.segment, active && styles.segmentActive]}
                  onPress={() => setAppearance(opt.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        <Text style={styles.currentHint}>Current: {currentLabel}</Text>
      </ScrollView>
    </View>
  )
}

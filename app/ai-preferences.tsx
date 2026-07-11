import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SPACING } from '../constants/theme'
import { SettingGroup, SettingRow } from '../components/Settings'
import { getSettings, patchSettings, Settings } from '../lib/settings'

export default function AIPreferencesScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    getSettings().then(setSettings)
  }, [])

  const toggle = (key: keyof Settings) => {
    setSettings(prev => {
      if (!prev) return prev
      const next = { ...prev, [key]: !prev[key] }
      patchSettings({ [key]: next[key] })
      return next
    })
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={styles.topAction}>Account</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>AI preferences</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: SPACING.lg, paddingBottom: insets.bottom + SPACING.xl * 2 }}
        showsVerticalScrollIndicator={false}
      >
        <SettingGroup title="AI suggestions">
          <SettingRow
            icon="flash-outline"
            label="Auto-organize new saves"
            toggle
            on={!!settings?.autoOrganize}
            onPress={() => toggle('autoOrganize')}
          />
          <SettingRow
            icon="pricetag-outline"
            label="Suggest tags"
            toggle
            on={!!settings?.aiSuggestTags}
            onPress={() => toggle('aiSuggestTags')}
          />
          <SettingRow
            icon="folder-outline"
            label="Suggest collections"
            toggle
            on={!!settings?.aiSuggestCollections}
            onPress={() => toggle('aiSuggestCollections')}
            last
          />
        </SettingGroup>

        <Text style={styles.explainer}>
          When you save a link, Trove asks AI to suggest a collection and tags. Auto-organize files
          new saves straight into the suggested collection; turn it off to review everything in your
          Inbox first. There is no separate &quot;Read Later&quot; collection — that label means Inbox.
        </Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.bg,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, paddingRight: SPACING.sm },
  topAction: { fontFamily: FONTS.sansSemi, fontSize: 15, color: COLORS.accent },
  topTitle: { fontFamily: FONTS.sansBold, fontSize: 16, color: COLORS.text },
  topSpacer: { width: 72 },

  explainer: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.muted,
    marginHorizontal: SPACING.lg,
    marginTop: -SPACING.sm,
  },
})

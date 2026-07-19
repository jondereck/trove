import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { FONTS, SPACING } from '../constants/theme'
import { SettingGroup, SettingRow } from '../components/Settings'
import { getSettings, patchSettings, Settings } from '../lib/settings'
import { useColors, useThemedStyles } from '../contexts/ThemeContext'

export default function AIPreferencesScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useColors()
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
  }))

  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    getSettings().then(setSettings)
  }, [])

  const toggle = (key: keyof Settings) => {
    setSettings(prev => {
      if (!prev) return prev
      const next = { ...prev, [key]: !prev[key] }
      patchSettings({ [key]: next[key] }).catch(() => {
        getSettings().then(setSettings)
      })
      return next
    })
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color={colors.accent} />
          <Text style={styles.topAction}>Settings</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Preference</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: SPACING.lg, paddingBottom: insets.bottom + SPACING.xl * 2 }}
        showsVerticalScrollIndicator={false}
      >
        <SettingGroup title="Quick save">
          <SettingRow
            icon="clipboard-outline"
            label="Auto-fill from clipboard"
            hint="When you tap +, paste a copied link into QuickSave automatically."
            toggle
            on={!!settings?.clipboardAutoPaste}
            onPress={() => toggle('clipboardAutoPaste')}
            last
          />
        </SettingGroup>

        <SettingGroup title="Sharing">
          <SettingRow
            icon="share-outline"
            label="Review when sharing"
            hint="Show a preview with AI suggestions before saving from other apps."
            toggle
            on={!!settings?.shareReviewModal}
            onPress={() => toggle('shareReviewModal')}
            last
          />
        </SettingGroup>

        <SettingGroup title="AI suggestions">
          <SettingRow
            icon="flash-outline"
            label="Auto-organize new saves"
            hint="File new saves into the suggested collection right away."
            toggle
            on={!!settings?.autoOrganize}
            onPress={() => toggle('autoOrganize')}
          />
          <SettingRow
            icon="text-outline"
            label="Suggest title and description"
            hint="Pull the page title and summary when saving a link."
            toggle
            on={!!settings?.aiSuggestTitleDescription}
            onPress={() => toggle('aiSuggestTitleDescription')}
          />
          <SettingRow
            icon="pricetag-outline"
            label="Suggest tags"
            hint="Propose tags based on the link or note content."
            toggle
            on={!!settings?.aiSuggestTags}
            onPress={() => toggle('aiSuggestTags')}
          />
          <SettingRow
            icon="folder-outline"
            label="Suggest collections"
            hint="Recommend which collection a save belongs in."
            toggle
            on={!!settings?.aiSuggestCollections}
            onPress={() => toggle('aiSuggestCollections')}
            last
          />
        </SettingGroup>
      </ScrollView>
    </View>
  )
}

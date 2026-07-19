import { useCallback, useEffect, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { FONTS, SPACING } from '../constants/theme'
import { SettingGroup, SettingRow } from '../components/Settings'
import {
  getSettings,
  patchSettings,
  type DigestCadence,
  type Settings,
} from '../lib/settings'
import {
  cancelDigestNotification,
  requestDigestPermissions,
} from '../lib/digestNotifications'
import { cancelUnreadNotification } from '../lib/unreadNotifications'
import { syncAllDigestNotifications } from '../lib/notificationsSync'
import { useColors, useThemedStyles } from '../contexts/ThemeContext'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const HOURS = Array.from({ length: 24 }, (_, h) => h)

function formatHour(h: number) {
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:00 ${period}`
}

export default function NotificationSettingsScreen() {
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
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
    },
    chip: {
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: c.card,
    },
    chipOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
    chipText: { fontFamily: FONTS.sansMed, fontSize: 13, color: c.textSub },
    chipTextOn: { color: c.accent },
    sectionHint: {
      fontFamily: FONTS.sans,
      fontSize: 13,
      color: c.muted,
      lineHeight: 18,
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.md,
    },
  }))

  const [settings, setSettings] = useState<Settings | null>(null)

  const load = useCallback(() => {
    getSettings().then(setSettings)
  }, [])

  useEffect(() => { load() }, [load])
  useFocusEffect(useCallback(() => { load() }, [load]))

  const apply = async (patch: Partial<Settings>) => {
    try {
      const next = await patchSettings(patch)
      setSettings(next)
      await syncAllDigestNotifications(next)
    } catch {
      load()
    }
  }

  const ensurePermission = async () => {
    const ok = await requestDigestPermissions()
    if (!ok) {
      Alert.alert(
        'Notifications blocked',
        'Enable notifications for Trove in system settings to get digests.',
      )
    }
    return ok
  }

  const toggleInbox = async () => {
    if (!settings) return
    if (!settings.digestEnabled) {
      if (!(await ensurePermission())) return
      await apply({ digestEnabled: true })
    } else {
      await apply({ digestEnabled: false })
      await cancelDigestNotification()
    }
  }

  const toggleUnread = async () => {
    if (!settings) return
    if (!settings.unreadDigestEnabled) {
      if (!(await ensurePermission())) return
      await apply({ unreadDigestEnabled: true })
    } else {
      await apply({ unreadDigestEnabled: false })
      await cancelUnreadNotification()
    }
  }

  const setCadence = async (digestCadence: DigestCadence) => {
    await apply({ digestCadence })
  }

  const scheduleVisible = !!(settings?.digestEnabled || settings?.unreadDigestEnabled)

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color={colors.accent} />
          <Text style={styles.topAction}>Settings</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Notifications</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: SPACING.lg, paddingBottom: insets.bottom + SPACING.xl * 2 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionHint}>
          Local reminders on this device. No account required. Inbox covers unsorted items; Unopened covers saves you have not opened yet. Both share the schedule below.
        </Text>

        <SettingGroup title="Reminders">
          <SettingRow
            icon="file-tray-outline"
            label="Inbox digest"
            hint="Unsorted saves waiting to be filed"
            toggle
            on={!!settings?.digestEnabled}
            onPress={toggleInbox}
          />
          <SettingRow
            icon="eye-outline"
            label="Unopened digest"
            hint="Saves marked NEW you have not opened"
            toggle
            on={!!settings?.unreadDigestEnabled}
            onPress={toggleUnread}
            last
          />
        </SettingGroup>

        {scheduleVisible && settings ? (
          <>
            <SettingGroup title="How often">
              <SettingRow
                icon="today-outline"
                label="Daily"
                toggle
                on={settings.digestCadence === 'daily'}
                onPress={() => setCadence('daily')}
              />
              <SettingRow
                icon="calendar-outline"
                label="Weekly"
                toggle
                on={settings.digestCadence === 'weekly'}
                onPress={() => setCadence('weekly')}
                last
              />
            </SettingGroup>

            <Text style={styles.sectionHint}>Time of day</Text>
            <View style={styles.chipRow}>
              {HOURS.filter(h => h % 2 === 0).map(h => {
                const on = settings.digestHour === h
                return (
                  <TouchableOpacity
                    key={h}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => apply({ digestHour: h })}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{formatHour(h)}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {settings.digestCadence === 'weekly' ? (
              <>
                <Text style={styles.sectionHint}>Day of week</Text>
                <View style={styles.chipRow}>
                  {WEEKDAYS.map((label, i) => {
                    const on = settings.digestWeekday === i
                    return (
                      <TouchableOpacity
                        key={label}
                        style={[styles.chip, on && styles.chipOn]}
                        onPress={() => apply({ digestWeekday: i })}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>{label.slice(0, 3)}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  )
}

import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ColorPalette, FONTS, RADIUS, SPACING } from '../constants/theme'
import { useColors, useThemedStyles } from '../contexts/ThemeContext'
import {
  markAllNotificationsRead,
  syncPresentedNotifications,
} from '../lib/notificationLog'
import type { NotificationLogEntry } from '../lib/notificationLogCore'

function formatDate(value: string): string {
  const date = new Date(value)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function NotificationsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useThemedStyles(createStyles)
  const insetStyles = useMemo(() => StyleSheet.create({
    topBar: { paddingTop: insets.top + SPACING.sm },
    content: { paddingBottom: insets.bottom + SPACING.xl },
  }), [insets.bottom, insets.top])
  const [entries, setEntries] = useState<NotificationLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      let active = true
      setLoading(true)
      syncPresentedNotifications()
        .then(next => {
          if (!active) return
          setEntries(next)
          setLoading(false)
          if (next.some(entry => !entry.read)) {
            void markAllNotificationsRead()
          }
        })
        .catch(() => {
          if (active) setLoading(false)
        })
      return () => {
        active = false
      }
    }, []),
  )

  const openEntry = (entry: NotificationLogEntry) => {
    if (entry.screen === 'inbox') router.push('/(tabs)/inbox')
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, insetStyles.topBar]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.6}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Notifications</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          insetStyles.content,
          !loading && entries.length === 0 && styles.emptyContent,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : entries.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="notifications-outline" size={30} color={colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptyText}>
              Inbox reminders and other Trove updates will appear here.
            </Text>
          </View>
        ) : (
          entries.map(entry => (
            <TouchableOpacity
              key={entry.id}
              style={styles.card}
              onPress={() => openEntry(entry)}
              disabled={!entry.screen}
              activeOpacity={entry.screen ? 0.72 : 1}
            >
              <View style={[styles.iconWrap, !entry.read && styles.iconWrapUnread]}>
                <Ionicons
                  name="file-tray-outline"
                  size={20}
                  color={!entry.read ? colors.accent : colors.textSub}
                />
              </View>
              <View style={styles.cardText}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, !entry.read && styles.cardTitleUnread]}>
                    {entry.title}
                  </Text>
                  <Text style={styles.cardDate}>{formatDate(entry.date)}</Text>
                </View>
                {entry.body ? <Text style={styles.cardBody}>{entry.body}</Text> : null}
              </View>
              {!entry.read ? <View style={styles.unreadDot} /> : null}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  )
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    backBtn: {
      width: 44,
      height: 40,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    topTitle: {
      fontFamily: FONTS.sansBold,
      fontSize: 16,
      color: c.text,
    },
    topSpacer: {
      width: 44,
    },
    content: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.lg,
      gap: SPACING.sm,
    },
    emptyContent: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    loader: {
      marginTop: SPACING.xl * 2,
    },
    empty: {
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
      paddingBottom: SPACING.xl * 2,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.lg,
    },
    emptyTitle: {
      fontFamily: FONTS.serif,
      fontSize: 24,
      color: c.text,
      marginBottom: SPACING.sm,
    },
    emptyText: {
      fontFamily: FONTS.sans,
      fontSize: 14,
      lineHeight: 20,
      color: c.textSub,
      textAlign: 'center',
    },
    card: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      padding: SPACING.md,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: RADIUS.lg,
      backgroundColor: c.card,
    },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: RADIUS.md,
      backgroundColor: c.cream,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrapUnread: {
      backgroundColor: c.accentSoft,
    },
    cardText: {
      flex: 1,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: SPACING.sm,
    },
    cardTitle: {
      flex: 1,
      fontFamily: FONTS.sansMed,
      fontSize: 14,
      color: c.text,
    },
    cardTitleUnread: {
      fontFamily: FONTS.sansBold,
    },
    cardDate: {
      fontFamily: FONTS.sans,
      fontSize: 11,
      color: c.muted,
    },
    cardBody: {
      fontFamily: FONTS.sans,
      fontSize: 13,
      lineHeight: 18,
      color: c.textSub,
      marginTop: 3,
    },
    unreadDot: {
      position: 'absolute',
      top: SPACING.sm,
      right: SPACING.sm,
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: c.accent,
    },
  })
}

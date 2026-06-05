import { useCallback, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS, FONTS, SPACING } from '../../constants/theme'
import { Save } from '../../types'
import SaveCard from '../../components/SaveCard'
import { MOCK_SAVES } from '../../lib/mockData'

// TODO: replace "Jon" with auth user's first name once auth is wired up
const USER_NAME = 'Jon'

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function LibraryScreen() {
  const insets = useSafeAreaInsets()
  const [saves, setSaves] = useState<Save[]>(
    MOCK_SAVES.filter((s) => !s.is_inbox)
  )
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    // TODO: fetch from supabase.from('saves').select('*').eq('is_inbox', false)
    setRefreshing(false)
  }, [])

  const leftCol = saves.filter((_, i) => i % 2 === 0)
  const rightCol = saves.filter((_, i) => i % 2 === 1)

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={COLORS.accent}
          colors={[COLORS.accent]}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting} numberOfLines={1}>
          {getGreeting()},{' '}
          <Text style={styles.greetingName}>{USER_NAME}</Text>
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{saves.length}</Text>
        </View>
      </View>

      {saves.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>◎</Text>
          <Text style={styles.emptyTitle}>Your library awaits</Text>
          <Text style={styles.emptySubtitle}>
            Tap + to save your first link, note, or image.
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          <View style={styles.col}>
            {leftCol.map((save) => (
              <SaveCard key={save.id} save={save} onPress={() => {}} />
            ))}
          </View>
          <View style={styles.col}>
            {rightCol.map((save) => (
              <SaveCard key={save.id} save={save} onPress={() => {}} />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  greeting: {
    fontSize: 26,
    fontFamily: FONTS.serif,
    color: COLORS.text,
    letterSpacing: -0.3,
    flex: 1,
  },
  greetingName: {
    color: COLORS.accent,
  },
  badge: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontFamily: FONTS.sansBold,
    color: '#fff',
  },
  grid: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  col: {
    flex: 1,
    gap: 0,
  },
  empty: {
    alignItems: 'center',
    paddingTop: SPACING.xl * 4,
    gap: SPACING.md,
  },
  emptyIcon: {
    fontSize: 40,
    color: COLORS.border,
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: FONTS.serif,
    color: COLORS.textSub,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
})

import { useCallback, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { Save, OrganizeSuggestion } from '../../types'
import SaveCard from '../../components/SaveCard'
import AIOrganize from '../../components/AIOrganize'
import { MOCK_SAVES, MOCK_COLLECTIONS } from '../../lib/mockData'

export default function InboxScreen() {
  const insets = useSafeAreaInsets()
  const [saves, setSaves] = useState<Save[]>(
    MOCK_SAVES.filter((s) => s.is_inbox)
  )
  const [refreshing, setRefreshing] = useState(false)
  const [aiVisible, setAiVisible] = useState(false)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    // TODO: fetch from supabase.from('saves').select('*').eq('is_inbox', true)
    setRefreshing(false)
  }, [])

  const handleApply = (accepted: OrganizeSuggestion[]) => {
    // Move accepted items out of inbox (mark is_inbox: false)
    const acceptedIds = new Set(accepted.map((a) => a.save.id))
    setSaves((prev) => prev.filter((s) => !acceptedIds.has(s.id)))
    // TODO: update in supabase
  }

  const leftCol = saves.filter((_, i) => i % 2 === 0)
  const rightCol = saves.filter((_, i) => i % 2 === 1)

  return (
    <>
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
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Inbox</Text>
            {saves.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{saves.length}</Text>
              </View>
            )}
          </View>
        </View>

        {saves.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>○</Text>
            <Text style={styles.emptyTitle}>Inbox is clear</Text>
            <Text style={styles.emptySubtitle}>
              Everything is organized. Tap + to save something new.
            </Text>
          </View>
        ) : (
          <>
            {/* AI Organize CTA */}
            <TouchableOpacity
              style={styles.aiCta}
              onPress={() => setAiVisible(true)}
              activeOpacity={0.8}
            >
              <View style={styles.aiOrb}>
                <Text style={styles.aiOrbIcon}>✦</Text>
              </View>
              <View style={styles.aiCtaText}>
                <Text style={styles.aiCtaTitle}>AI Organize</Text>
                <Text style={styles.aiCtaSub}>Sort {saves.length} items into collections</Text>
              </View>
              <Text style={styles.aiChevron}>›</Text>
            </TouchableOpacity>

            {/* Masonry grid */}
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
          </>
        )}
      </ScrollView>

      <AIOrganize
        visible={aiVisible}
        onClose={() => setAiVisible(false)}
        saves={saves}
        collections={MOCK_COLLECTIONS}
        onApply={handleApply}
      />
    </>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  title: {
    fontSize: 32,
    fontFamily: FONTS.serif,
    color: COLORS.text,
    letterSpacing: -0.5,
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

  // AI CTA banner
  aiCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#f0c4b4',
    padding: SPACING.md,
    gap: SPACING.md,
    marginBottom: SPACING.lg,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  aiOrb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiOrbIcon: {
    fontSize: 14,
    color: '#fff',
  },
  aiCtaText: {
    flex: 1,
  },
  aiCtaTitle: {
    fontSize: 14,
    fontFamily: FONTS.sansSemi,
    color: COLORS.text,
  },
  aiCtaSub: {
    fontSize: 12,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
    marginTop: 1,
  },
  aiChevron: {
    fontSize: 22,
    color: COLORS.muted,
    fontFamily: FONTS.sans,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  col: {
    flex: 1,
  },

  // Empty
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

import { useCallback, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { Save, Collection, OrganizeSuggestion } from '../../types'
import SaveCard from '../../components/SaveCard'
import SwipeableCard from '../../components/SwipeableCard'
import AIOrganize from '../../components/AIOrganize'
import { fetchInboxSaves, fetchCollections, updateSave } from '../../lib/db'
import { applyOrganizeSuggestions } from '../../lib/organize'

export default function InboxScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [saves, setSaves] = useState<Save[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [aiVisible, setAiVisible] = useState(false)

  const loadData = useCallback(async () => {
    const [inboxSaves, cols] = await Promise.all([fetchInboxSaves(), fetchCollections()])
    setSaves(inboxSaves)
    setCollections(cols)
  }, [])

  // Reload on focus so AI-organized / edited saves leave the inbox
  useFocusEffect(
    useCallback(() => {
      loadData().finally(() => setLoading(false))
    }, [loadData])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [loadData])

  const handleApply = useCallback(async (accepted: OrganizeSuggestion[]) => {
    // Optimistic UI update
    const acceptedIds = new Set(accepted.map(a => a.save.id))
    setSaves(prev => prev.filter(s => !acceptedIds.has(s.id)))

    await applyOrganizeSuggestions(accepted)

    // Refresh collections so counts are updated
    fetchCollections().then(setCollections)
  }, [])

  // Swipe a card out of the inbox — moves it to the Library, uncategorized.
  const handleArchive = useCallback(async (save: Save) => {
    setSaves(prev => prev.filter(s => s.id !== save.id))
    await updateSave(save.id, { is_inbox: false })
  }, [])

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

        {loading ? (
          <ActivityIndicator color={COLORS.accent} style={styles.loader} />
        ) : saves.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>○</Text>
            <Text style={styles.emptyTitle}>Inbox is clear</Text>
            <Text style={styles.emptySubtitle}>Everything is organized. Tap + to save something new.</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity style={styles.aiCta} onPress={() => setAiVisible(true)} activeOpacity={0.8}>
              <View style={styles.aiOrb}><Text style={styles.aiOrbIcon}>✦</Text></View>
              <View style={styles.aiCtaText}>
                <Text style={styles.aiCtaTitle}>AI Organize</Text>
                <Text style={styles.aiCtaSub}>Sort {saves.length} items into collections</Text>
              </View>
              <Text style={styles.aiChevron}>›</Text>
            </TouchableOpacity>

            <View style={styles.grid}>
              <View style={styles.col}>
                {leftCol.map(save => (
                  <SwipeableCard
                    key={save.id}
                    onArchive={async () => {
                      setSaves(prev => prev.filter(s => s.id !== save.id))
                      await updateSave(save.id, { is_inbox: false })
                    }}
                  >
                    <SaveCard save={save} onPress={() => router.push(`/save/${save.id}`)} />
                  </SwipeableCard>
                ))}
              </View>
              <View style={styles.col}>
                {rightCol.map(save => (
                  <SwipeableCard
                    key={save.id}
                    onArchive={async () => {
                      setSaves(prev => prev.filter(s => s.id !== save.id))
                      await updateSave(save.id, { is_inbox: false })
                    }}
                  >
                    <SaveCard save={save} onPress={() => router.push(`/save/${save.id}`)} />
                  </SwipeableCard>
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
        collections={collections}
        onApply={handleApply}
      />
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl * 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: SPACING.lg, paddingBottom: SPACING.xl },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { fontSize: 32, fontFamily: FONTS.serif, color: COLORS.text, letterSpacing: -0.5 },
  badge: { backgroundColor: COLORS.accent, borderRadius: 10, paddingHorizontal: SPACING.sm, paddingVertical: 2, minWidth: 22, alignItems: 'center' },
  badgeText: { fontSize: 11, fontFamily: FONTS.sansBold, color: '#fff' },
  loader: { marginTop: SPACING.xl * 3 },
  aiCta: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: '#f0c4b4',
    padding: SPACING.md, gap: SPACING.md, marginBottom: SPACING.lg,
    shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
  },
  aiOrb: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  aiOrbIcon: { fontSize: 14, color: '#fff' },
  aiCtaText: { flex: 1 },
  aiCtaTitle: { fontSize: 14, fontFamily: FONTS.sansSemi, color: COLORS.text },
  aiCtaSub: { fontSize: 12, fontFamily: FONTS.sans, color: COLORS.muted, marginTop: 1 },
  aiChevron: { fontSize: 22, color: COLORS.muted, fontFamily: FONTS.sans },
  grid: { flexDirection: 'row', gap: SPACING.sm },
  col: { flex: 1 },
  empty: { alignItems: 'center', paddingTop: SPACING.xl * 4, gap: SPACING.md },
  emptyIcon: { fontSize: 40, color: COLORS.border, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.serif, color: COLORS.textSub },
  emptySubtitle: { fontSize: 14, fontFamily: FONTS.sans, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.xl },
})

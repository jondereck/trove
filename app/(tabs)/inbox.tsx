import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { ColorPalette, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { useColors, useThemedStyles } from '../../contexts/ThemeContext'
import { UNSORTED_LABEL } from '../../constants/labels'
import { ORGANIZE_BATCH_LIMIT } from '../../constants/organize'
import { Save, Collection, OrganizeSuggestion } from '../../types'
import SaveCard from '../../components/SaveCard'
import SwipeableCard from '../../components/SwipeableCard'
import AIOrganize from '../../components/AIOrganize'
import MoveToCollectionModal from '../../components/MoveToCollectionModal'
import { fetchInboxSaves, fetchCollections, updateSave, deleteSave } from '../../lib/db'
import { applyOrganizeSuggestions } from '../../lib/organize'
import { showUpgradeAlert } from '../../lib/upgradeAlert'
import { subscribeDataChanges } from '../../lib/dataEvents'

export default function InboxScreen() {
  const colors = useColors()
  const styles = useThemedStyles(createStyles)
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [saves, setSaves] = useState<Save[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [aiVisible, setAiVisible] = useState(false)

  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showMoveModal, setShowMoveModal] = useState(false)

  const loadData = useCallback(async () => {
    const [inboxSaves, cols] = await Promise.all([fetchInboxSaves(), fetchCollections()])
    setSaves(inboxSaves)
    setCollections(cols)
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadData().finally(() => setLoading(false))
    }, [loadData])
  )

  useEffect(() => subscribeDataChanges(() => {
    loadData().catch(() => {})
  }), [loadData])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [loadData])

  const handleApply = useCallback(async (accepted: OrganizeSuggestion[]) => {
    const acceptedIds = new Set(accepted.map(a => a.save.id))
    setSaves(prev => prev.filter(s => !acceptedIds.has(s.id)))
    const { limited } = await applyOrganizeSuggestions(accepted)
    if (limited > 0) {
      showUpgradeAlert(
        'Collection limit reached',
        `${limited} ${limited === 1 ? 'item' : 'items'} could not be filed into new collections on the free plan.`
      )
    }
    fetchCollections().then(setCollections)
  }, [])

  const enterSelection = (saveId: string) => {
    setSelectionMode(true)
    setSelectedIds(new Set([saveId]))
  }

  const toggleSelect = (saveId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(saveId)) next.delete(saveId)
      else next.add(saveId)
      return next
    })
  }

  const cancelSelection = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  const openMoveModal = async () => {
    const cols = await fetchCollections()
    setCollections(cols)
    setShowMoveModal(true)
  }

  const handleBulkMove = async (targetCollId: string) => {
    await Promise.all(
      [...selectedIds].map(sid =>
        updateSave(sid, { collection_id: targetCollId, is_inbox: false })
      )
    )
    setSaves(prev => prev.filter(s => !selectedIds.has(s.id)))
    setShowMoveModal(false)
    cancelSelection()
    fetchCollections().then(setCollections)
  }

  const handleBulkDelete = () => {
    Alert.alert(
      `Delete ${selectedIds.size} ${selectedIds.size === 1 ? 'save' : 'saves'}?`,
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await Promise.all([...selectedIds].map(id => deleteSave(id)))
            setSaves(prev => prev.filter(s => !selectedIds.has(s.id)))
            cancelSelection()
          },
        },
      ]
    )
  }

  const leftCol = saves.filter((_, i) => i % 2 === 0)
  const rightCol = saves.filter((_, i) => i % 2 === 1)
  const unreadCount = saves.filter(s => s.is_viewed === false).length
  const organizeBatch = saves.slice(0, ORGANIZE_BATCH_LIMIT)
  const organizeRemaining = Math.max(0, saves.length - ORGANIZE_BATCH_LIMIT)

  const renderCard = (save: Save) => {
    const card = (
      <SaveCard
        save={save}
        selected={selectionMode ? selectedIds.has(save.id) : undefined}
        onPress={() =>
          selectionMode ? toggleSelect(save.id) : router.push(`/save/${save.id}`)
        }
        onLongPress={() => !selectionMode && enterSelection(save.id)}
      />
    )

    if (selectionMode) return <View key={save.id}>{card}</View>

    return (
      <SwipeableCard
        key={save.id}
        onArchive={async () => {
          setSaves(prev => prev.filter(s => s.id !== save.id))
          await updateSave(save.id, { is_inbox: false })
        }}
      >
        {card}
      </SwipeableCard>
    )
  }

  return (
    <View style={[styles.wrapper, { paddingTop: insets.top }]}>
      {selectionMode && (
        <View style={styles.selectionBar}>
          <TouchableOpacity onPress={cancelSelection} style={styles.selBarBtn} activeOpacity={0.7}>
            <Text style={styles.selBarCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.selBarCount}>{selectedIds.size} selected</Text>
          <View style={styles.selBarActions}>
            <TouchableOpacity
              onPress={openMoveModal}
              style={[styles.selBarBtn, selectedIds.size === 0 && styles.selBarBtnDisabled]}
              disabled={selectedIds.size === 0}
              activeOpacity={0.7}
            >
              <Ionicons
                name="arrow-forward-circle-outline"
                size={22}
                color={selectedIds.size > 0 ? colors.accent : colors.muted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleBulkDelete}
              style={[styles.selBarBtn, selectedIds.size === 0 && styles.selBarBtnDisabled]}
              disabled={selectedIds.size === 0}
              activeOpacity={0.7}
            >
              <Ionicons
                name="trash-outline"
                size={20}
                color={selectedIds.size > 0 ? '#e53e3e' : colors.muted}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {!selectionMode && (
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>{UNSORTED_LABEL}</Text>
              {unreadCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount} new</Text>
                </View>
              ) : saves.length > 0 ? (
                <View style={[styles.badge, styles.badgeMuted]}>
                  <Text style={styles.badgeText}>{saves.length}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : saves.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>○</Text>
            <Text style={styles.emptyTitle}>{UNSORTED_LABEL} is clear</Text>
            <Text style={styles.emptySubtitle}>Everything is organized. Tap + to save something new.</Text>
          </View>
        ) : (
          <>
            {!selectionMode && (
              <TouchableOpacity style={styles.aiCta} onPress={() => setAiVisible(true)} activeOpacity={0.8}>
                <View style={styles.aiOrb}><Ionicons name="sparkles" size={18} color="#fff" /></View>
                <View style={styles.aiCtaText}>
                  <Text style={styles.aiCtaTitle}>AI Organize</Text>
                  <Text style={styles.aiCtaSub}>
                    {organizeRemaining > 0
                      ? `Sort ${ORGANIZE_BATCH_LIMIT} of ${saves.length} items`
                      : `Sort ${saves.length} items into collections`}
                  </Text>
                </View>
                <Text style={styles.aiChevron}>›</Text>
              </TouchableOpacity>
            )}

            <View style={styles.grid}>
              <View style={styles.col}>{leftCol.map(renderCard)}</View>
              <View style={styles.col}>{rightCol.map(renderCard)}</View>
            </View>
          </>
        )}
      </ScrollView>

      <MoveToCollectionModal
        visible={showMoveModal}
        collections={collections}
        onClose={() => setShowMoveModal(false)}
        onSelect={handleBulkMove}
        onCreated={col => setCollections(prev => [...prev, col])}
      />

      <AIOrganize
        visible={aiVisible}
        onClose={() => setAiVisible(false)}
        saves={organizeBatch}
        collections={collections}
        onApply={handleApply}
      />
    </View>
  )
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: c.bg },
  container: { flex: 1, backgroundColor: c.bg },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl * 2 },

  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    backgroundColor: c.bg,
  },
  selBarBtn: { padding: SPACING.xs },
  selBarBtnDisabled: { opacity: 0.4 },
  selBarCancel: { fontSize: 15, fontFamily: FONTS.sansMed, color: c.accent },
  selBarCount: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: FONTS.sansSemi,
    color: c.text,
  },
  selBarActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { fontSize: 32, fontFamily: FONTS.serif, color: c.text, letterSpacing: -0.5 },
  badge: {
    backgroundColor: c.accent,
    borderRadius: 10,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
  },
  badgeMuted: {
    backgroundColor: c.muted,
  },
  badgeText: { fontSize: 11, fontFamily: FONTS.sansBold, color: '#fff' },
  loader: { marginTop: SPACING.xl * 3 },
  aiCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: c.accentBorder,
    padding: SPACING.md,
    gap: SPACING.md,
    marginBottom: SPACING.lg,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  aiOrb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiCtaText: { flex: 1 },
  aiCtaTitle: { fontSize: 14, fontFamily: FONTS.sansSemi, color: c.text },
  aiCtaSub: { fontSize: 12, fontFamily: FONTS.sans, color: c.muted, marginTop: 1 },
  aiChevron: { fontSize: 22, color: c.muted, fontFamily: FONTS.sans },
  grid: { flexDirection: 'row', gap: SPACING.sm },
  col: { flex: 1 },
  empty: { alignItems: 'center', paddingTop: SPACING.xl * 4, gap: SPACING.md },
  emptyIcon: { fontSize: 40, color: c.border, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.serif, color: c.textSub },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: FONTS.sans,
    color: c.muted,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
})}

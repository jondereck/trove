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
  Modal,
  FlatList,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { DEFAULT_COLLECTION_ICON, IoniconName } from '../../constants/icons'
import { Save, Collection, OrganizeSuggestion } from '../../types'
import SaveCard from '../../components/SaveCard'
import SwipeableCard from '../../components/SwipeableCard'
import AIOrganize from '../../components/AIOrganize'
import { fetchInboxSaves, fetchCollections, updateSave, deleteSave } from '../../lib/db'
import { applyOrganizeSuggestions } from '../../lib/organize'
import { showUpgradeAlert } from '../../lib/upgradeAlert'
import { subscribeDataChanges } from '../../lib/dataEvents'

export default function InboxScreen() {
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
                color={selectedIds.size > 0 ? COLORS.accent : COLORS.muted}
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
                color={selectedIds.size > 0 ? '#e53e3e' : COLORS.muted}
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
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {!selectionMode && (
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
        )}

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
            {!selectionMode && (
              <TouchableOpacity style={styles.aiCta} onPress={() => setAiVisible(true)} activeOpacity={0.8}>
                <View style={styles.aiOrb}><Ionicons name="sparkles" size={18} color="#fff" /></View>
                <View style={styles.aiCtaText}>
                  <Text style={styles.aiCtaTitle}>AI Organize</Text>
                  <Text style={styles.aiCtaSub}>Sort {saves.length} items into collections</Text>
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

      <Modal
        visible={showMoveModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMoveModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setShowMoveModal(false)}
            activeOpacity={1}
          />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + SPACING.lg }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Move to…</Text>
            <FlatList
              data={collections}
              keyExtractor={c => c.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.collRow}
                  onPress={() => handleBulkMove(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.collIcon, { backgroundColor: item.color + '22' }]}>
                    <Ionicons
                      name={(item.icon as IoniconName) ?? DEFAULT_COLLECTION_ICON}
                      size={18}
                      color={item.color}
                    />
                  </View>
                  <Text style={styles.collRowName}>{item.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.modalEmpty}>No collections yet. Create one first.</Text>
              }
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

      <AIOrganize
        visible={aiVisible}
        onClose={() => setAiVisible(false)}
        saves={saves}
        collections={collections}
        onApply={handleApply}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl * 2 },

  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  selBarBtn: { padding: SPACING.xs },
  selBarBtnDisabled: { opacity: 0.4 },
  selBarCancel: { fontSize: 15, fontFamily: FONTS.sansMed, color: COLORS.accent },
  selBarCount: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: FONTS.sansSemi,
    color: COLORS.text,
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
  title: { fontSize: 32, fontFamily: FONTS.serif, color: COLORS.text, letterSpacing: -0.5 },
  badge: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
  },
  badgeText: { fontSize: 11, fontFamily: FONTS.sansBold, color: '#fff' },
  loader: { marginTop: SPACING.xl * 3 },
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
  aiCtaText: { flex: 1 },
  aiCtaTitle: { fontSize: 14, fontFamily: FONTS.sansSemi, color: COLORS.text },
  aiCtaSub: { fontSize: 12, fontFamily: FONTS.sans, color: COLORS.muted, marginTop: 1 },
  aiChevron: { fontSize: 22, color: COLORS.muted, fontFamily: FONTS.sans },
  grid: { flexDirection: 'row', gap: SPACING.sm },
  col: { flex: 1 },
  empty: { alignItems: 'center', paddingTop: SPACING.xl * 4, gap: SPACING.md },
  emptyIcon: { fontSize: 40, color: COLORS.border, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.serif, color: COLORS.textSub },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },

  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: {
    backgroundColor: COLORS.cream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    maxHeight: '60%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  modalTitle: { fontSize: 18, fontFamily: FONTS.serif, color: COLORS.text, marginBottom: SPACING.md },
  collRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  collIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collRowName: { flex: 1, fontSize: 15, fontFamily: FONTS.sansMed, color: COLORS.text },
  modalEmpty: {
    fontSize: 14,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
    textAlign: 'center',
    paddingVertical: SPACING.xl,
  },
})

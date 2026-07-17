import { useCallback, useState } from 'react'
import {
  View, Text, ScrollView, RefreshControl, StyleSheet,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { ColorPalette, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { useColors, useThemedStyles } from '../../contexts/ThemeContext'
import { DEFAULT_COLLECTION_ICON, IoniconName } from '../../constants/icons'
import { Save, Collection } from '../../types'
import { fetchCollectionById, fetchSavesByCollection, fetchCollections, deleteSave, updateSave, deleteCollection, updateCollection } from '../../lib/db'
import SaveCard from '../../components/SaveCard'
import CollectionForm from '../../components/CollectionForm'
import MoveToCollectionModal from '../../components/MoveToCollectionModal'
import { canPinMoreCollections } from '../../constants/pinLimits'
import { partitionPinned } from '../../lib/pinnedSections'

export default function CollectionDetailScreen() {
  const colors = useColors()
  const styles = useThemedStyles(createStyles)
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [collection, setCollection] = useState<Collection | null>(null)
  const [saves, setSaves] = useState<Save[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Bulk selection
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [allCollections, setAllCollections] = useState<Collection[]>([])
  const [editVisible, setEditVisible] = useState(false)
  const [isPinned, setIsPinned] = useState(false)

  const load = useCallback(async () => {
    const [col, items] = await Promise.all([fetchCollectionById(id), fetchSavesByCollection(id)])
    setCollection(col)
    setIsPinned(!!col?.is_pinned)
    setSaves(items)
  }, [id])

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false))
    }, [load])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  // ── Selection helpers ──────────────────────────────────────────────────────

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
            await Promise.all([...selectedIds].map(sid => deleteSave(sid)))
            setSaves(prev => prev.filter(s => !selectedIds.has(s.id)))
            cancelSelection()
          },
        },
      ]
    )
  }

  const openMoveModal = async () => {
    const cols = await fetchCollections()
    setAllCollections(cols)
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
  }

  const handleDeleteCollection = () => {
    if (!collection) return
    const itemCount = saves.length
    if (itemCount > 0) {
      Alert.alert(
        'Collection not empty',
        `This collection has ${itemCount} ${itemCount === 1 ? 'item' : 'items'}. Move or delete them before removing the collection.`,
        [{ text: 'OK' }]
      )
      return
    }

    Alert.alert(
      'Delete collection?',
      `"${collection.name}" will be permanently removed. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteCollection(collection.id)
            if (ok) router.back()
            else Alert.alert('Could not delete', 'Please try again.')
          },
        },
      ]
    )
  }

  const togglePin = async () => {
    if (!collection) return
    const next = !isPinned
    if (next) {
      const cols = await fetchCollections()
      if (!canPinMoreCollections(cols, collection.id)) {
        Alert.alert('Pin limit reached', 'You can pin up to 3 collections. Unpin one to add another.')
        return
      }
    }
    setIsPinned(next)
    const ok = await updateCollection(collection.id, { is_pinned: next })
    if (!ok) setIsPinned(!next)
    else setCollection({ ...collection, is_pinned: next })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const handleSavePinToggle = useCallback((saveId: string, pinned: boolean) => {
    setSaves(prev => prev.map(save =>
      save.id === saveId ? { ...save, is_pinned: pinned } : save
    ))
  }, [])

  const { pinned: pinnedSaves, unpinned: unpinnedSaves } = partitionPinned(saves)

  const renderSaveCard = (save: Save) => (
    <SaveCard
      key={save.id}
      save={save}
      selected={selectionMode ? selectedIds.has(save.id) : undefined}
      onPress={() => selectionMode ? toggleSelect(save.id) : router.push(`/save/${save.id}`)}
      onLongPress={() => !selectionMode && enterSelection(save.id)}
      onPinToggle={pinned => handleSavePinToggle(save.id, pinned)}
    />
  )

  const renderSaveGrid = (items: Save[]) => (
    <View style={styles.grid}>
      <View style={styles.col}>
        {items.filter((_, i) => i % 2 === 0).map(renderSaveCard)}
      </View>
      <View style={styles.col}>
        {items.filter((_, i) => i % 2 === 1).map(renderSaveCard)}
      </View>
    </View>
  )

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={styles.header}>
        {selectionMode ? (
          <>
            <TouchableOpacity onPress={cancelSelection} style={styles.headerBtn} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <Text style={styles.selectionCount}>
              {selectedIds.size} selected
            </Text>

            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={openMoveModal}
                style={[styles.actionBtn, selectedIds.size === 0 && styles.actionBtnDisabled]}
                disabled={selectedIds.size === 0}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-forward-circle-outline" size={22} color={selectedIds.size > 0 ? colors.accent : colors.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleBulkDelete}
                style={[styles.actionBtn, selectedIds.size === 0 && styles.actionBtnDisabled]}
                disabled={selectedIds.size === 0}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={22} color={selectedIds.size > 0 ? '#e53e3e' : colors.muted} />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
            {collection && (
              <View style={styles.headerCenter}>
                <Ionicons
                  name={(collection.icon as IoniconName) ?? DEFAULT_COLLECTION_ICON}
                  size={18}
                  color={collection.color}
                />
                <Text style={styles.name} numberOfLines={1}>{collection.name}</Text>
              </View>
            )}
            <View style={styles.headerRight}>
              {!loading && collection && (
                <TouchableOpacity onPress={togglePin} style={styles.selectBtn} activeOpacity={0.7}>
                  <Ionicons
                    name={isPinned ? 'pin' : 'pin-outline'}
                    size={22}
                    color={isPinned ? colors.accent : colors.muted}
                  />
                </TouchableOpacity>
              )}
              {!loading && collection && (
                <TouchableOpacity onPress={() => setEditVisible(true)} style={styles.selectBtn} activeOpacity={0.7}>
                  <Ionicons name="create-outline" size={22} color={colors.muted} />
                </TouchableOpacity>
              )}
              {!loading && saves.length > 0 && (
                <TouchableOpacity onPress={() => enterSelection(saves[0].id)} style={styles.selectBtn} activeOpacity={0.7}>
                  <Ionicons name="checkmark-circle-outline" size={22} color={colors.muted} />
                </TouchableOpacity>
              )}
              {!loading && collection && (
                <TouchableOpacity onPress={handleDeleteCollection} style={styles.selectBtn} activeOpacity={0.7}>
                  <Ionicons name="trash-outline" size={22} color={colors.muted} />
                </TouchableOpacity>
              )}
              {!loading && (
                <View style={[styles.countBadge, { backgroundColor: (collection?.color ?? colors.accent) + '22' }]}>
                  <Text style={[styles.countText, { color: collection?.color ?? colors.accent }]}>
                    {saves.length}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
          }
          showsVerticalScrollIndicator={false}
        >
          {saves.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons
                name={(collection?.icon as IoniconName) ?? DEFAULT_COLLECTION_ICON}
                size={44}
                color={colors.border}
                style={styles.emptyIcon}
              />
              <Text style={styles.emptyTitle}>No saves yet</Text>
              <Text style={styles.emptySubtitle}>Use AI Organize or set collection in a save to add items here.</Text>
            </View>
          ) : pinnedSaves.length > 0 ? (
            <View>
              <View style={styles.sectionHeader}>
                <Ionicons name="pin" size={13} color={colors.accent} />
                <Text style={styles.sectionLabel}>PINNED</Text>
              </View>
              {renderSaveGrid(pinnedSaves)}
              {unpinnedSaves.length > 0 && (
                <>
                  <View style={[styles.sectionHeader, styles.sectionHeaderSecondary]}>
                    <Text style={styles.sectionLabelMuted}>ALL SAVES</Text>
                  </View>
                  {renderSaveGrid(unpinnedSaves)}
                </>
              )}
            </View>
          ) : (
            renderSaveGrid(saves)
          )}
        </ScrollView>
      )}

      <MoveToCollectionModal
        visible={showMoveModal}
        collections={allCollections}
        excludeId={collection?.id}
        onClose={() => setShowMoveModal(false)}
        onSelect={handleBulkMove}
        onCreated={col => setAllCollections(prev => [...prev, col])}
      />

      <CollectionForm
        visible={editVisible}
        collection={collection ? { ...collection, save_count: saves.length } : null}
        onClose={() => setEditVisible(false)}
        onSaved={async () => {
          const col = await fetchCollectionById(id)
          if (!col) {
            router.back()
            return
          }
          await load()
        }}
      />
    </View>
  )
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },

    // Header
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
      borderBottomWidth: 1, borderBottomColor: c.border,
      minHeight: 52,
    },
    backBtn: { padding: SPACING.xs, marginRight: SPACING.sm },
    backText: { fontSize: 22, color: c.text },
    headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    name: { fontSize: 18, fontFamily: FONTS.serif, color: c.text, flex: 1 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginLeft: SPACING.sm },
    selectBtn: { padding: 2 },
    countBadge: { borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 3, minWidth: 28, alignItems: 'center' },
    countText: { fontSize: 12, fontFamily: FONTS.sansBold },

    // Selection mode header
    headerBtn: { padding: SPACING.xs },
    cancelText: { fontSize: 15, fontFamily: FONTS.sansMed, color: c.accent },
    selectionCount: { flex: 1, textAlign: 'center', fontSize: 15, fontFamily: FONTS.sansSemi, color: c.text },
    headerActions: { flexDirection: 'row', gap: SPACING.sm },
    actionBtn: { padding: SPACING.xs },
    actionBtnDisabled: { opacity: 0.4 },

    loader: { marginTop: SPACING.xl * 3 },
    content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      marginBottom: SPACING.sm,
    },
    sectionHeaderSecondary: {
      marginTop: SPACING.xl,
      paddingTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    sectionLabel: { fontSize: 10, fontFamily: FONTS.monoMed, color: c.accent, letterSpacing: 1.2 },
    sectionLabelMuted: { fontSize: 10, fontFamily: FONTS.monoMed, color: c.muted, letterSpacing: 1.2 },
    grid: { flexDirection: 'row', gap: SPACING.sm },
    col: { flex: 1 },
    empty: { alignItems: 'center', paddingTop: SPACING.xl * 3, gap: SPACING.md },
    emptyIcon: { fontSize: 40, marginBottom: SPACING.sm },
    emptyTitle: { fontSize: 20, fontFamily: FONTS.serif, color: c.textSub },
    emptySubtitle: { fontSize: 14, fontFamily: FONTS.sans, color: c.muted, textAlign: 'center', paddingHorizontal: SPACING.xl },

    // Move modal
    modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
    modalSheet: {
      backgroundColor: c.cream,
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm,
      maxHeight: '60%',
    },
    modalHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: SPACING.lg },
    modalTitle: { fontSize: 18, fontFamily: FONTS.serif, color: c.text, marginBottom: SPACING.md },
    collRow: {
      flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    collIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    collRowName: { flex: 1, fontSize: 15, fontFamily: FONTS.sansMed, color: c.text },
    modalEmpty: { fontSize: 14, fontFamily: FONTS.sans, color: c.muted, textAlign: 'center', paddingVertical: SPACING.xl },
  })
}

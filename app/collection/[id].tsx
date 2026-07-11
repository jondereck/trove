import { useCallback, useState } from 'react'
import {
  View, Text, ScrollView, RefreshControl, StyleSheet,
  TouchableOpacity, ActivityIndicator, Alert, Modal, FlatList,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { DEFAULT_COLLECTION_ICON, IoniconName } from '../../constants/icons'
import { Save, Collection } from '../../types'
import { fetchCollectionById, fetchSavesByCollection, fetchCollections, deleteSave, updateSave, deleteCollection } from '../../lib/db'
import SaveCard from '../../components/SaveCard'
import CollectionForm from '../../components/CollectionForm'

export default function CollectionDetailScreen() {
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

  const load = useCallback(async () => {
    const [col, items] = await Promise.all([fetchCollectionById(id), fetchSavesByCollection(id)])
    setCollection(col)
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
    // Exclude the current collection
    setAllCollections(cols.filter(c => c.id !== id))
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

  // ── Render ─────────────────────────────────────────────────────────────────

  const leftCol = saves.filter((_, i) => i % 2 === 0)
  const rightCol = saves.filter((_, i) => i % 2 === 1)

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
                <Ionicons name="arrow-forward-circle-outline" size={22} color={selectedIds.size > 0 ? COLORS.accent : COLORS.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleBulkDelete}
                style={[styles.actionBtn, selectedIds.size === 0 && styles.actionBtnDisabled]}
                disabled={selectedIds.size === 0}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={22} color={selectedIds.size > 0 ? '#e53e3e' : COLORS.muted} />
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
                <TouchableOpacity onPress={() => setEditVisible(true)} style={styles.selectBtn} activeOpacity={0.7}>
                  <Ionicons name="create-outline" size={22} color={COLORS.muted} />
                </TouchableOpacity>
              )}
              {!loading && saves.length > 0 && (
                <TouchableOpacity onPress={() => enterSelection(saves[0].id)} style={styles.selectBtn} activeOpacity={0.7}>
                  <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.muted} />
                </TouchableOpacity>
              )}
              {!loading && collection && (
                <TouchableOpacity onPress={handleDeleteCollection} style={styles.selectBtn} activeOpacity={0.7}>
                  <Ionicons name="trash-outline" size={22} color={COLORS.muted} />
                </TouchableOpacity>
              )}
              {!loading && (
                <View style={[styles.countBadge, { backgroundColor: (collection?.color ?? COLORS.accent) + '22' }]}>
                  <Text style={[styles.countText, { color: collection?.color ?? COLORS.accent }]}>
                    {saves.length}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.accent} style={styles.loader} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} colors={[COLORS.accent]} />
          }
          showsVerticalScrollIndicator={false}
        >
          {saves.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons
                name={(collection?.icon as IoniconName) ?? DEFAULT_COLLECTION_ICON}
                size={44}
                color={COLORS.border}
                style={styles.emptyIcon}
              />
              <Text style={styles.emptyTitle}>No saves yet</Text>
              <Text style={styles.emptySubtitle}>Use AI Organize or set collection in a save to add items here.</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              <View style={styles.col}>
                {leftCol.map(save => (
                  <SaveCard
                    key={save.id}
                    save={save}
                    selected={selectionMode ? selectedIds.has(save.id) : undefined}
                    onPress={() => selectionMode ? toggleSelect(save.id) : router.push(`/save/${save.id}`)}
                    onLongPress={() => !selectionMode && enterSelection(save.id)}
                  />
                ))}
              </View>
              <View style={styles.col}>
                {rightCol.map(save => (
                  <SaveCard
                    key={save.id}
                    save={save}
                    selected={selectionMode ? selectedIds.has(save.id) : undefined}
                    onPress={() => selectionMode ? toggleSelect(save.id) : router.push(`/save/${save.id}`)}
                    onLongPress={() => !selectionMode && enterSelection(save.id)}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* Move to collection modal */}
      <Modal visible={showMoveModal} transparent animationType="slide" onRequestClose={() => setShowMoveModal(false)}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowMoveModal(false)} activeOpacity={1} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + SPACING.lg }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Move to…</Text>
            <FlatList
              data={allCollections}
              keyExtractor={c => c.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.collRow}
                  onPress={() => handleBulkMove(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.collIcon, { backgroundColor: item.color + '22' }]}>
                    <Ionicons name={(item.icon as IoniconName) ?? DEFAULT_COLLECTION_ICON} size={18} color={item.color} />
                  </View>
                  <Text style={styles.collRowName}>{item.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.modalEmpty}>No other collections yet.</Text>
              }
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    minHeight: 52,
  },
  backBtn: { padding: SPACING.xs, marginRight: SPACING.sm },
  backText: { fontSize: 22, color: COLORS.text },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  name: { fontSize: 18, fontFamily: FONTS.serif, color: COLORS.text, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginLeft: SPACING.sm },
  selectBtn: { padding: 2 },
  countBadge: { borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 3, minWidth: 28, alignItems: 'center' },
  countText: { fontSize: 12, fontFamily: FONTS.sansBold },

  // Selection mode header
  headerBtn: { padding: SPACING.xs },
  cancelText: { fontSize: 15, fontFamily: FONTS.sansMed, color: COLORS.accent },
  selectionCount: { flex: 1, textAlign: 'center', fontSize: 15, fontFamily: FONTS.sansSemi, color: COLORS.text },
  headerActions: { flexDirection: 'row', gap: SPACING.sm },
  actionBtn: { padding: SPACING.xs },
  actionBtnDisabled: { opacity: 0.4 },

  loader: { marginTop: SPACING.xl * 3 },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
  grid: { flexDirection: 'row', gap: SPACING.sm },
  col: { flex: 1 },
  empty: { alignItems: 'center', paddingTop: SPACING.xl * 3, gap: SPACING.md },
  emptyIcon: { fontSize: 40, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.serif, color: COLORS.textSub },
  emptySubtitle: { fontSize: 14, fontFamily: FONTS.sans, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.xl },

  // Move modal
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: {
    backgroundColor: COLORS.cream,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm,
    maxHeight: '60%',
  },
  modalHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, marginBottom: SPACING.lg },
  modalTitle: { fontSize: 18, fontFamily: FONTS.serif, color: COLORS.text, marginBottom: SPACING.md },
  collRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  collIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  collRowName: { flex: 1, fontSize: 15, fontFamily: FONTS.sansMed, color: COLORS.text },
  modalEmpty: { fontSize: 14, fontFamily: FONTS.sans, color: COLORS.muted, textAlign: 'center', paddingVertical: SPACING.xl },
})

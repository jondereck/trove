import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { ColorPalette, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { useColors, useThemedStyles } from '../../contexts/ThemeContext'
import { COLLECTION_ICONS, DEFAULT_COLLECTION_ICON, IoniconName } from '../../constants/icons'
import { Collection } from '../../types'
import { fetchCollections, createCollection, deleteCollection, updateCollection } from '../../lib/db'
import { isLimitError, showLimitAlert } from '../../lib/upgradeAlert'
import { subscribeDataChanges } from '../../lib/dataEvents'
import { canPinMoreCollections, MAX_PINNED_COLLECTIONS } from '../../constants/pinLimits'
import { partitionPinned } from '../../lib/pinnedSections'

// Appends an alpha byte to a #rrggbb hex so a saturated collection color reads
// as a soft pastel when layered over the cream cover base.
function tint(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')
  return `${hex}${a}`
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

const COLOR_OPTIONS = ['#c0613c','#5c7a6e','#4a5568','#7c6d8a','#b87333','#2d6a9f']

export default function CollectionsScreen() {
  const colors = useColors()
  const styles = useThemedStyles(createStyles)
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Create modal state
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState<IoniconName>(DEFAULT_COLLECTION_ICON)
  const [newColor, setNewColor] = useState(colors.accent)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Bulk selection
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const slideY = useRef(new Animated.Value(SCREEN_HEIGHT)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current
  const nameInputRef = useRef<TextInput>(null)
  const openFrame = useRef<number | null>(null)
  const pendingRefresh = useRef(false)

  const loadCollections = useCallback(async () => {
    const data = await fetchCollections()
    setCollections(data)
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadCollections().finally(() => setLoading(false))
    }, [loadCollections])
  )

  useEffect(() => subscribeDataChanges(() => {
    if (showCreate) {
      pendingRefresh.current = true
      return
    }
    loadCollections().catch(() => {})
  }), [loadCollections, showCreate])

  useEffect(() => () => {
    if (openFrame.current !== null) cancelAnimationFrame(openFrame.current)
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadCollections()
    setRefreshing(false)
  }, [loadCollections])

  const openCreate = () => {
    if (showCreate) return
    slideY.stopAnimation()
    backdropOpacity.stopAnimation()
    slideY.setValue(SCREEN_HEIGHT)
    backdropOpacity.setValue(0)
    setShowCreate(true)
    openFrame.current = requestAnimationFrame(() => {
      openFrame.current = null
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, damping: 22, mass: 0.85, stiffness: 200, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) nameInputRef.current?.focus()
      })
    })
  }

  const closeCreate = (refreshAfter = false) => {
    if (openFrame.current !== null) {
      cancelAnimationFrame(openFrame.current)
      openFrame.current = null
    }
    Keyboard.dismiss()
    slideY.stopAnimation()
    backdropOpacity.stopAnimation()
    Animated.parallel([
      Animated.timing(slideY, { toValue: SCREEN_HEIGHT, duration: 260, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setShowCreate(false)
      setNewName('')
      setNewIcon(DEFAULT_COLLECTION_ICON)
      setNewColor(colors.accent)
      setCreateError('')
      if (refreshAfter || pendingRefresh.current) {
        pendingRefresh.current = false
        loadCollections().catch(() => {})
      }
    })
  }

  const handleCreate = async () => {
    if (!newName.trim() || creating) return
    setCreateError('')
    setCreating(true)

    let result
    try {
      result = await createCollection({
        name: newName.trim(),
        icon: newIcon,
        color: newColor,
      })
    } catch (e) {
      setCreating(false)
      if (isLimitError(e)) {
        closeCreate(false)
        showLimitAlert(e)
        return
      }
      setCreateError('Could not create the collection. Please try again.')
      return
    }

    setCreating(false)

    if (!result) {
      // Supabase unique constraint rejects duplicate names per user
      setCreateError('A collection with this name already exists.')
      return
    }

    closeCreate(true)
  }

  const enterSelection = (id: string) => {
    setSelectionMode(true)
    setSelectedIds(new Set([id]))
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const cancelSelection = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return

    const selected = collections.filter(c => selectedIds.has(c.id))
    const empty = selected.filter(c => (c.save_count ?? 0) === 0)
    const blocked = selected.filter(c => (c.save_count ?? 0) > 0)

    if (empty.length === 0) {
      Alert.alert(
        'Collections not empty',
        selected.length === 1
          ? `"${selected[0].name}" has items. Move or delete them before removing this collection.`
          : 'None of the selected collections are empty. Move or delete their items first.',
        [{ text: 'OK' }]
      )
      return
    }

    const blockedNote = blocked.length > 0
      ? `\n\n${blocked.length} ${blocked.length === 1 ? 'collection has' : 'collections have'} items and will be skipped.`
      : ''

    Alert.alert(
      `Delete ${empty.length} ${empty.length === 1 ? 'collection' : 'collections'}?`,
      `Empty collections will be permanently removed.${blockedNote}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const results = await Promise.all(empty.map(c => deleteCollection(c.id)))
            const failed = results.filter(ok => !ok).length
            await loadCollections()
            cancelSelection()
            if (failed > 0) {
              Alert.alert('Some deletes failed', 'Please try again.')
            }
          },
        },
      ]
    )
  }

  const onCardPress = (col: Collection) => {
    if (selectionMode) toggleSelect(col.id)
    else router.push(`/collection/${col.id}`)
  }

  const handlePinToggle = useCallback((colId: string, pinned: boolean) => {
    setCollections(prev => {
      const next = prev.map(c => c.id === colId ? { ...c, is_pinned: pinned } : c)
      next.sort((a, b) => {
        const pinDiff = Number(!!b.is_pinned) - Number(!!a.is_pinned)
        return pinDiff !== 0 ? pinDiff : a.name.localeCompare(b.name)
      })
      return next
    })
  }, [])

  const { pinned: pinnedCollections, unpinned: unpinnedCollections } = partitionPinned(collections)

  const renderCollectionCard = (col: Collection) => (
    <CollectionCard
      key={col.id}
      collection={col}
      collections={collections}
      selected={selectionMode ? selectedIds.has(col.id) : undefined}
      onPress={() => onCardPress(col)}
      onLongPress={() => !selectionMode && enterSelection(col.id)}
      onPinToggle={pinned => handlePinToggle(col.id, pinned)}
    />
  )

  const renderCollectionGrid = (items: Collection[]) => (
    <View style={styles.grid}>
      <View style={styles.col}>
        {items.filter((_, i) => i % 2 === 0).map(renderCollectionCard)}
      </View>
      <View style={styles.col}>
        {items.filter((_, i) => i % 2 === 1).map(renderCollectionCard)}
      </View>
    </View>
  )

  return (
    <View style={[styles.wrapper, { paddingTop: insets.top }]}>
      {selectionMode && (
        <View style={styles.selectionBar}>
          <TouchableOpacity onPress={cancelSelection} style={styles.selBarBtn} activeOpacity={0.7}>
            <Text style={styles.selBarCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.selBarCount}>{selectedIds.size} selected</Text>
          <TouchableOpacity
            onPress={handleBulkDelete}
            style={[styles.selBarBtn, selectedIds.size === 0 && styles.selBarBtnDisabled]}
            disabled={selectedIds.size === 0}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={20} color={selectedIds.size > 0 ? '#e53e3e' : colors.muted} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {!selectionMode && (
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.kicker}>{collections.length} COLLECTIONS</Text>
              <Text style={styles.title}>Collections</Text>
            </View>
            <TouchableOpacity style={styles.newBtn} onPress={openCreate} activeOpacity={0.75}>
              <Text style={styles.newBtnText}>New +</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : collections.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>◈</Text>
            <Text style={styles.emptyTitle}>No collections yet</Text>
            <Text style={styles.emptySubtitle}>Tap "New +" to create your first collection.</Text>
          </View>
        ) : pinnedCollections.length > 0 ? (
          <View>
            <View style={styles.sectionHeader}>
              <Ionicons name="pin" size={13} color={colors.accent} />
              <Text style={styles.sectionLabel}>PINNED</Text>
            </View>
            {renderCollectionGrid(pinnedCollections)}
            {unpinnedCollections.length > 0 && (
              <>
                <View style={[styles.sectionHeader, styles.sectionHeaderSecondary]}>
                  <Text style={styles.sectionLabelMuted}>ALL COLLECTIONS</Text>
                </View>
                {renderCollectionGrid(unpinnedCollections)}
              </>
            )}
          </View>
        ) : (
          renderCollectionGrid(collections)
        )}
      </ScrollView>

      {/* Create Collection Modal */}
      <Modal transparent visible={showCreate} animationType="none" onRequestClose={() => closeCreate()}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => closeCreate()} activeOpacity={1} />
        </Animated.View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kvWrap} pointerEvents="box-none">
          <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg, transform: [{ translateY: slideY }] }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>New Collection</Text>

            {/* Name */}
            <Text style={styles.label}>NAME</Text>
            <TextInput
              ref={nameInputRef}
              style={styles.input}
              value={newName}
              onChangeText={v => { setNewName(v); setCreateError('') }}
              placeholder="e.g. Design Inspiration"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />

            <View style={styles.errorSlot}>
              {createError ? <Text style={styles.errorText}>{createError}</Text> : null}
            </View>

            {/* Icon */}
            <Text style={styles.label}>ICON</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconRow}>
              {COLLECTION_ICONS.map(name => {
                const active = newIcon === name
                return (
                  <TouchableOpacity
                    key={name}
                    style={[styles.iconBtn, active && styles.iconBtnActive]}
                    onPress={() => setNewIcon(name)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={name} size={20} color={active ? newColor : colors.textSub} />
                  </TouchableOpacity>
                )
              })}
            </ScrollView>

            {/* Color */}
            <Text style={styles.label}>COLOR</Text>
            <View style={styles.colorRow}>
              {COLOR_OPTIONS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorSwatch, { backgroundColor: c }, newColor === c && styles.colorSwatchActive]}
                  onPress={() => setNewColor(c)}
                  activeOpacity={0.8}
                />
              ))}
            </View>

            {/* Preview */}
            <View style={[styles.preview, { borderLeftColor: newColor }]}>
              <Ionicons name={newIcon} size={20} color={newColor} />
              <Text style={styles.previewName}>{newName || 'Collection Name'}</Text>
            </View>

            {/* Create button */}
            <TouchableOpacity
              style={[styles.createBtn, { backgroundColor: newColor }, (!newName.trim() || creating) && styles.createBtnDisabled]}
              onPress={handleCreate}
              disabled={!newName.trim() || creating}
              activeOpacity={0.85}
            >
              {creating
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.createBtnText}>Create Collection</Text>
              }
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

// A cover tile: shows a recent save's thumbnail when one exists, otherwise a
// color-tinted placeholder derived from the collection color.
function CoverTile({ url, color, alpha, radius, style }: {
  url?: string
  color: string
  alpha: number
  radius: number
  style?: object
}) {
  if (url) {
    return <Image source={{ uri: url }} style={[{ borderRadius: radius }, style]} resizeMode="cover" />
  }
  return <View style={[{ borderRadius: radius, backgroundColor: tint(color, alpha) }, style]} />
}

function CollectionCard({
  collection,
  collections,
  onPress,
  onLongPress,
  selected,
  onPinToggle,
}: {
  collection: Collection
  collections: Collection[]
  onPress: () => void
  onLongPress?: () => void
  selected?: boolean
  onPinToggle?: (pinned: boolean) => void
}) {
  const colors = useColors()
  const styles = useThemedStyles(createStyles)
  const covers = collection.cover_urls ?? []
  const color = collection.color || colors.accent
  const count = collection.save_count ?? 0
  const inSelectionMode = selected !== undefined
  const [isPinned, setIsPinned] = useState(!!collection.is_pinned)

  useEffect(() => {
    setIsPinned(!!collection.is_pinned)
  }, [collection.id, collection.is_pinned])

  const handlePin = async () => {
    const next = !isPinned
    if (next && !canPinMoreCollections(collections, collection.id)) {
      Alert.alert('Pin limit reached', `You can pin up to ${MAX_PINNED_COLLECTIONS} collections. Unpin one to add another.`)
      return
    }
    setIsPinned(next)
    try {
      // updateCollection returns false (without throwing) when the write is
      // rejected, e.g. the is_pinned column is missing — revert instead of lying.
      const ok = await updateCollection(collection.id, { is_pinned: next })
      if (!ok) {
        setIsPinned(!next)
        return
      }
      onPinToggle?.(next)
    } catch {
      setIsPinned(!next)
    }
  }

  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
    >
      {/* Collage of recent-save thumbnails */}
      <View style={styles.cover}>
        {covers[0] ? (
          <Image source={{ uri: covers[0] }} style={styles.coverBig} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[tint(color, 0.9), tint(color, 0.55)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.coverBig}
          />
        )}
        <View style={styles.coverColumn}>
          <CoverTile url={covers[1]} color={color} alpha={0.34} radius={8} style={styles.coverSmall} />
          <CoverTile url={covers[2]} color={color} alpha={0.2} radius={8} style={styles.coverSmall} />
        </View>
      </View>

      {/* Meta */}
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>{collection.name}</Text>
        <Text style={styles.cardMeta}>{count} {count === 1 ? 'item' : 'items'}</Text>
      </View>

      {!inSelectionMode && (
        <TouchableOpacity style={styles.pinBtn} onPress={handlePin} activeOpacity={0.7}>
          <Ionicons
            name={isPinned ? 'pin' : 'pin-outline'}
            size={15}
            color={isPinned ? colors.accent : colors.muted}
          />
        </TouchableOpacity>
      )}

      {inSelectionMode && (
        <View style={[styles.selectionOverlay, selected && styles.selectionOverlayActive]} pointerEvents="none">
          <View style={[styles.checkCircle, selected && styles.checkCircleActive]}>
            {selected && <Ionicons name="checkmark" size={13} color="#fff" />}
          </View>
        </View>
      )}
    </TouchableOpacity>
  )
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: c.bg },
  container: { flex: 1, backgroundColor: c.bg },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl * 2 },

  selectionBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: c.border,
    backgroundColor: c.bg,
  },
  selBarBtn: { padding: SPACING.xs },
  selBarBtnDisabled: { opacity: 0.4 },
  selBarCancel: { fontSize: 15, fontFamily: FONTS.sansMed, color: c.accent },
  selBarCount: { flex: 1, textAlign: 'center', fontSize: 15, fontFamily: FONTS.sansSemi, color: c.text },

  header: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingTop: SPACING.md, paddingBottom: SPACING.lg,
  },
  headerText: { flex: 1 },
  kicker: { fontSize: 11, fontFamily: FONTS.mono, color: c.muted, letterSpacing: 1, marginBottom: 4 },
  title: { fontSize: 38, fontFamily: FONTS.serif, color: c.text, letterSpacing: -0.5, lineHeight: 40 },
  newBtn: { backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  newBtnText: { fontSize: 13, fontFamily: FONTS.sansSemi, color: '#fff' },
  loader: { marginTop: SPACING.xl * 3 },
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

  // 2-column grid
  grid: { flexDirection: 'row', gap: 14 },
  col: { flex: 1, gap: 14 },

  // Collection card
  card: {
    backgroundColor: c.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
    shadowColor: '#281e14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 2,
  },
  cardSelected: {
    borderColor: c.accent,
    borderWidth: 2,
  },
  cover: { flexDirection: 'row', gap: 3, height: 96, padding: 8, backgroundColor: c.cream },
  coverBig: { flex: 2, height: '100%', borderRadius: 10 },
  coverColumn: { flex: 1, gap: 3 },
  coverSmall: { flex: 1, width: '100%' },
  cardBody: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14 },
  cardName: { fontSize: 15, fontFamily: FONTS.sansBold, color: c.text },
  cardMeta: { fontSize: 12, fontFamily: FONTS.sans, color: c.muted, marginTop: 3 },
  pinBtn: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.border,
  },

  selectionOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
    alignItems: 'flex-end',
    padding: SPACING.sm,
  },
  selectionOverlayActive: {
    backgroundColor: 'rgba(192,97,60,0.08)',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.border,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleActive: {
    borderColor: c.accent,
    backgroundColor: c.accent,
  },

  // Empty
  empty: { alignItems: 'center', paddingTop: SPACING.xl * 4, gap: SPACING.md },
  emptyIcon: { fontSize: 40, color: c.border, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.serif, color: c.textSub },
  emptySubtitle: { fontSize: 14, fontFamily: FONTS.sans, color: c.muted, textAlign: 'center', paddingHorizontal: SPACING.xl },

  // Modal
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  kvWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: c.cream, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 20,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: SPACING.lg },
  sheetTitle: { fontSize: 20, fontFamily: FONTS.serif, color: c.text, marginBottom: SPACING.lg },
  label: { fontSize: 10, fontFamily: FONTS.sansSemi, color: c.muted, letterSpacing: 1, marginBottom: SPACING.sm, marginTop: SPACING.md },
  input: {
    backgroundColor: c.card, borderWidth: 1.5, borderColor: c.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    fontSize: 15, fontFamily: FONTS.sans, color: c.text,
  },
  errorSlot: { minHeight: 18, marginTop: SPACING.xs },
  errorText: { fontSize: 12, fontFamily: FONTS.sans, color: c.accent },
  iconRow: { marginBottom: SPACING.sm },
  iconBtn: {
    width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'transparent', marginRight: SPACING.sm,
  },
  iconBtnActive: { borderColor: c.accent, backgroundColor: c.accentSoft },
  colorRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSwatchActive: { borderWidth: 3, borderColor: c.text },
  preview: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: c.card, borderRadius: RADIUS.md, borderLeftWidth: 4,
    padding: SPACING.md, marginBottom: SPACING.lg,
  },
  previewName: { fontSize: 15, fontFamily: FONTS.sansMed, color: c.text, flex: 1 },
  createBtn: { borderRadius: RADIUS.md, paddingVertical: SPACING.md + 2, alignItems: 'center' },
  createBtnDisabled: { opacity: 0.45 },
  createBtnText: { fontSize: 15, fontFamily: FONTS.sansSemi, color: '#fff', letterSpacing: 0.2 },
  })
}

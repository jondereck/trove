import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { ColorPalette, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { useColors, useThemedStyles } from '../../contexts/ThemeContext'
import { LIBRARY_INITIAL_PAGE, LIBRARY_LOAD_MORE, LIBRARY_SCROLL_THRESHOLD } from '../../constants/library'
import { ORGANIZE_BATCH_LIMIT } from '../../constants/organize'
import { Save, Collection, OrganizeSuggestion, LibraryFilter } from '../../types'
import SaveCard from '../../components/SaveCard'
import AIOrganize from '../../components/AIOrganize'
import MoveToCollectionModal from '../../components/MoveToCollectionModal'
import {
  fetchLibrarySavesPage,
  fetchLibraryCount,
  fetchInboxSaves,
  fetchCollections,
  fetchProfile,
  deleteSave,
  updateSave,
} from '../../lib/db'
import { applyOrganizeSuggestions } from '../../lib/organize'
import { showUpgradeAlert } from '../../lib/upgradeAlert'
import { subscribeDataChanges } from '../../lib/dataEvents'
import { getSettings, patchSettings } from '../../lib/settings'
import { cacheProfile, peekProfile } from '../../lib/profileCache'
import { partitionPinned } from '../../lib/pinnedSections'
import {
  getUnreadNotificationCount,
  subscribeNotificationLog,
} from '../../lib/notificationLog'
import {
  cacheLibrarySnapshot,
  loadLibraryCache,
  peekLibraryCache,
} from '../../lib/libraryCache'

type LibraryView = 'grid' | 'list'

const CHIPS: { id: LibraryFilter; label: string; icon?: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread', icon: 'mail-unread-outline' },
  { id: 'fav', label: 'Favorites', icon: 'star-outline' },
  { id: 'link', label: 'Links', icon: 'link-outline' },
  { id: 'image', label: 'Images', icon: 'image-outline' },
  { id: 'video', label: 'Videos', icon: 'videocam-outline' },
  { id: 'note', label: 'Notes', icon: 'document-text-outline' },
]

function getGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  return 'Good evening'
}

const initialCache = peekLibraryCache()

export default function LibraryScreen() {
  const colors = useColors()
  const styles = useThemedStyles(createStyles)
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [saves, setSaves] = useState<Save[]>(initialCache?.saves ?? [])
  const [libraryTotal, setLibraryTotal] = useState(initialCache?.libraryTotal ?? 0)
  const [filteredTotal, setFilteredTotal] = useState(initialCache?.filteredTotal ?? 0)
  const [inboxSaves, setInboxSaves] = useState<Save[]>(initialCache?.inboxSaves ?? [])
  const [collections, setCollections] = useState<Collection[]>(initialCache?.collections ?? [])
  const [loading, setLoading] = useState(!initialCache)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const cachedProfile = peekProfile()
  const [profileReady, setProfileReady] = useState(!!cachedProfile)
  const [userName, setUserName] = useState<string | null>(cachedProfile?.first_name ?? null)
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [viewMode, setViewMode] = useState<LibraryView>('grid')
  const [aiVisible, setAiVisible] = useState(false)
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0)

  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showMoveModal, setShowMoveModal] = useState(false)

  const savesLenRef = useRef(0)
  const filteredTotalRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const skipFilterReload = useRef(true)
  const initialLoadDone = useRef(false)

  useEffect(() => { savesLenRef.current = saves.length }, [saves.length])
  useEffect(() => { filteredTotalRef.current = filteredTotal }, [filteredTotal])

  const loadLibraryPage = useCallback(async (offset: number, append: boolean) => {
    const limit = offset === 0 ? LIBRARY_INITIAL_PAGE : LIBRARY_LOAD_MORE
    const page = await fetchLibrarySavesPage({ limit, offset, filter })
    if (append) {
      setSaves(prev => [...prev, ...page.saves])
    } else {
      setSaves(page.saves)
    }
    setFilteredTotal(page.total)
    return page
  }, [filter])

  const loadMeta = useCallback(async () => {
    const [libCount, inbox, cols, profile] = await Promise.all([
      fetchLibraryCount(),
      fetchInboxSaves(),
      fetchCollections(),
      fetchProfile(),
    ])
    setLibraryTotal(libCount)
    setInboxSaves(inbox)
    setCollections(cols)
    setUserName(profile?.first_name ?? null)
    if (profile) cacheProfile(profile)
    setProfileReady(true)
  }, [])

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    await Promise.all([loadMeta(), loadLibraryPage(0, false)])
    if (showSpinner) setLoading(false)
  }, [loadMeta, loadLibraryPage])

  const persistCache = useCallback((
    nextSaves: Save[],
    nextLibraryTotal: number,
    nextFilteredTotal: number,
    nextInbox: Save[],
    nextCollections: Collection[],
  ) => {
    void cacheLibrarySnapshot({
      saves: nextSaves,
      libraryTotal: nextLibraryTotal,
      filteredTotal: nextFilteredTotal,
      inboxSaves: nextInbox,
      collections: nextCollections,
      filter,
      cachedAt: new Date().toISOString(),
    })
  }, [filter])

  useEffect(() => {
    void loadLibraryCache().then(cached => {
      if (!cached || cached.filter !== filter) return
      setSaves(cached.saves)
      setLibraryTotal(cached.libraryTotal)
      setFilteredTotal(cached.filteredTotal)
      setInboxSaves(cached.inboxSaves)
      setCollections(cached.collections)
      setLoading(false)
    })
  }, [filter])

  useEffect(() => {
    if (!initialLoadDone.current) return
    void persistCache(saves, libraryTotal, filteredTotal, inboxSaves, collections)
  }, [saves, libraryTotal, filteredTotal, inboxSaves, collections, persistCache])

  useEffect(() => {
    getSettings().then(s => setViewMode(s.libraryView ?? 'grid'))
  }, [])

  useEffect(() => {
    const refresh = () => {
      getUnreadNotificationCount().then(setNotificationUnreadCount).catch(() => {})
    }
    refresh()
    return subscribeNotificationLog(refresh)
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!initialLoadDone.current) {
        initialLoadDone.current = true
        const cached = peekLibraryCache()
        if (cached && cached.filter === filter) {
          setLoading(false)
          return
        }
        loadData(true)
      }
    }, [filter, loadData])
  )

  useEffect(() => subscribeDataChanges((change, payload) => {
    if (change === 'viewed' && payload) {
      setSaves(prev => {
        if (filter === 'unread' && payload.is_viewed) {
          return prev.filter(s => s.id !== payload.id)
        }
        return prev.map(s => s.id === payload.id ? { ...s, is_viewed: payload.is_viewed } : s)
      })
      if (filter === 'unread' && payload.is_viewed) {
        setFilteredTotal(t => Math.max(0, t - 1))
      }
      return
    }
    if (change === 'saves' || change === 'collections') {
      loadData(false).catch(() => {})
    }
  }), [loadData, filter])

  useEffect(() => {
    if (skipFilterReload.current) {
      skipFilterReload.current = false
      return
    }
    setLoading(true)
    loadLibraryPage(0, false).finally(() => setLoading(false))
  }, [filter, loadLibraryPage])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || savesLenRef.current >= filteredTotalRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      await loadLibraryPage(savesLenRef.current, true)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [loadLibraryPage])

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - LIBRARY_SCROLL_THRESHOLD) {
      loadMore()
    }
  }, [loadMore])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData(false)
    setRefreshing(false)
  }, [loadData])

  const handleApply = useCallback(async (accepted: OrganizeSuggestion[]) => {
    const acceptedIds = new Set(accepted.map(a => a.save.id))
    setInboxSaves(prev => prev.filter(s => !acceptedIds.has(s.id)))
    const { limited } = await applyOrganizeSuggestions(accepted)
    if (limited > 0) {
      showUpgradeAlert(
        'Collection limit reached',
        `${limited} ${limited === 1 ? 'item' : 'items'} could not be filed into new collections on the free plan.`
      )
    }
    await loadData(false)
  }, [loadData])

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
    setLibraryTotal(prev => Math.max(0, prev - selectedIds.size))
    setFilteredTotal(prev => Math.max(0, prev - selectedIds.size))
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
            const deleted = selectedIds.size
            setSaves(prev => prev.filter(s => !selectedIds.has(s.id)))
            setLibraryTotal(prev => Math.max(0, prev - deleted))
            setFilteredTotal(prev => Math.max(0, prev - deleted))
            cancelSelection()
          },
        },
      ]
    )
  }

  const handlePinToggle = useCallback((saveId: string, pinned: boolean) => {
    setSaves(prev => {
      const next = prev.map(s => s.id === saveId ? { ...s, is_pinned: pinned } : s)
      next.sort((a, b) => {
        const pinDiff = Number(!!b.is_pinned) - Number(!!a.is_pinned)
        return pinDiff !== 0 ? pinDiff : b.created_at.localeCompare(a.created_at)
      })
      return next
    })
  }, [])

  const toggleViewMode = useCallback(() => {
    setViewMode(prev => {
      const next: LibraryView = prev === 'grid' ? 'list' : 'grid'
      patchSettings({ libraryView: next }).catch(() => {
        getSettings().then(s => setViewMode(s.libraryView))
      })
      return next
    })
  }, [])

  const organizeBatch = inboxSaves.slice(0, ORGANIZE_BATCH_LIMIT)
  const organizeRemaining = Math.max(0, inboxSaves.length - ORGANIZE_BATCH_LIMIT)

  const greetingLine = profileReady
    ? `${getGreeting()}, ${userName?.trim() || 'there'}.`
    : ''

  const dateLabel = new Date()
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase()

  const { pinned: pinnedSaves, unpinned: unpinnedSaves } = partitionPinned(saves)
  const hasPinnedSaves = pinnedSaves.length > 0

  const renderSaveCard = (save: Save) => (
    <SaveCard
      key={save.id}
      save={save}
      layout={viewMode}
      selected={selectionMode ? selectedIds.has(save.id) : undefined}
      onPress={() => selectionMode ? toggleSelect(save.id) : router.push(`/save/${save.id}`)}
      onLongPress={() => !selectionMode && enterSelection(save.id)}
      onPinToggle={pinned => handlePinToggle(save.id, pinned)}
    />
  )

  const renderSaveGrid = (items: Save[]) => (
    <View style={styles.grid}>
      <View style={styles.col}>{items.filter((_, i) => i % 2 === 0).map(renderSaveCard)}</View>
      <View style={styles.col}>{items.filter((_, i) => i % 2 === 1).map(renderSaveCard)}</View>
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
              <Ionicons name="trash-outline" size={20} color={selectedIds.size > 0 ? '#e53e3e' : colors.muted} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={200}
      >
        {!selectionMode && profileReady && (
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.greetingLine} numberOfLines={2}>{greetingLine}</Text>
              <View style={styles.subRow}>
                <Text style={styles.kicker}>{libraryTotal} SAVED</Text>
                <View style={styles.dot} />
                <Text style={styles.kickerAccent}>{dateLabel}</Text>
              </View>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => router.push('/notifications')}
                activeOpacity={0.75}
                style={styles.settingsBtn}
                accessibilityLabel="Notifications"
              >
                <Ionicons name="notifications-outline" size={22} color={colors.text} />
                {notificationUnreadCount > 0 ? (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {notificationUnreadCount > 9 ? '9+' : notificationUnreadCount}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/account')}
                activeOpacity={0.75}
                style={styles.settingsBtn}
                accessibilityLabel="Settings"
              >
                <Ionicons name="settings-outline" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.filterBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
          >
            {CHIPS.map(c => {
              const on = filter === c.id
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setFilter(c.id)}
                  activeOpacity={0.7}
                >
                  {c.icon && <Ionicons name={c.icon} size={15} color={on ? '#fff' : colors.text} />}
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
          <TouchableOpacity
            style={styles.viewToggle}
            onPress={toggleViewMode}
            activeOpacity={0.7}
            accessibilityLabel={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
          >
            <Ionicons
              name={viewMode === 'grid' ? 'list-outline' : 'grid-outline'}
              size={20}
              color={colors.text}
            />
          </TouchableOpacity>
        </View>

        {!selectionMode && inboxSaves.length > 0 && (
          <View style={styles.banner}>
            <View style={styles.bannerOrb}>
              <Ionicons name="sparkles" size={20} color="#fff" />
            </View>
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>
                {inboxSaves.length} {inboxSaves.length === 1 ? 'save' : 'saves'} waiting to be sorted
              </Text>
              <Text style={styles.bannerSub}>
                {organizeRemaining > 0
                  ? `AI will organize up to ${ORGANIZE_BATCH_LIMIT} at a time`
                  : 'Let AI file them into collections'}
              </Text>
            </View>
            <TouchableOpacity style={styles.bannerBtn} onPress={() => setAiVisible(true)} activeOpacity={0.85}>
              <Text style={styles.bannerBtnText}>Organize</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : filteredTotal === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>◇</Text>
            <Text style={styles.emptyTitle}>
              {filter === 'all'
                ? 'Nothing saved yet'
                : filter === 'unread'
                  ? 'All caught up'
                  : 'No matches'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {filter === 'all'
                ? 'Tap + to save your first link, note, or image.'
                : filter === 'unread'
                  ? 'Every item in your library has been opened at least once.'
                  : 'Try a different filter or save something new.'}
            </Text>
          </View>
        ) : hasPinnedSaves ? (
          <View>
            <View style={styles.sectionHeader}>
              <Ionicons name="pin" size={13} color={colors.accent} />
              <Text style={styles.sectionLabel}>PINNED</Text>
            </View>
            {viewMode === 'list'
              ? <View style={styles.list}>{pinnedSaves.map(renderSaveCard)}</View>
              : renderSaveGrid(pinnedSaves)}
            {unpinnedSaves.length > 0 && (
              <>
                <View style={[styles.sectionHeader, styles.sectionHeaderSecondary]}>
                  <Text style={styles.sectionLabelMuted}>ALL SAVES</Text>
                </View>
                {viewMode === 'list'
                  ? <View style={styles.list}>{unpinnedSaves.map(renderSaveCard)}</View>
                  : renderSaveGrid(unpinnedSaves)}
              </>
            )}
          </View>
        ) : viewMode === 'list' ? (
          <View style={styles.list}>{saves.map(renderSaveCard)}</View>
        ) : (
          renderSaveGrid(saves)
        )}

        {loadingMore && (
          <ActivityIndicator color={colors.accent} style={styles.loadMore} />
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
  container: { flex: 1 },
  content: { paddingBottom: SPACING.xl * 2, paddingHorizontal: SPACING.lg },

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
  selBarActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },

  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingTop: SPACING.lg, paddingBottom: SPACING.lg,
  },
  headerLeft: { flex: 1, paddingRight: SPACING.md },
  headerActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  greetingLine: {
    fontSize: 34,
    fontFamily: FONTS.serifItal,
    color: c.text,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.sm },
  kicker: { fontSize: 11, fontFamily: FONTS.mono, color: c.muted, letterSpacing: 1 },
  kickerAccent: { fontSize: 11, fontFamily: FONTS.monoMed, color: c.accent, letterSpacing: 1 },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: c.muted },
  settingsBtn: {
    position: 'relative',
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accent,
  },
  notificationBadgeText: {
    fontFamily: FONTS.sansBold,
    fontSize: 9,
    color: '#fff',
  },

  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  viewToggle: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: SPACING.sm,
  },
  chipScroll: { flex: 1 },
  chipRow: { paddingRight: SPACING.md },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card,
    marginRight: SPACING.md,
  },
  chipOn: { backgroundColor: c.text, borderColor: c.text },
  chipText: { fontSize: 13, fontFamily: FONTS.sansSemi, color: c.text },
  chipTextOn: { color: '#fff' },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    marginBottom: SPACING.lg,
    padding: SPACING.md, borderRadius: RADIUS.lg,
    backgroundColor: c.accentSoft, borderWidth: 1, borderColor: c.accentBorder,
  },
  bannerOrb: {
    width: 38, height: 38, borderRadius: 11, backgroundColor: c.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 14, fontFamily: FONTS.sansBold, color: c.text },
  bannerSub: { fontSize: 12.5, fontFamily: FONTS.sans, color: c.textSub, marginTop: 1 },
  bannerBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 999, backgroundColor: c.accent },
  bannerBtnText: { fontSize: 13, fontFamily: FONTS.sansBold, color: '#fff' },

  loader: { marginTop: SPACING.xl * 3 },
  loadMore: { marginVertical: SPACING.lg },
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
  list: { gap: SPACING.sm },
  col: { flex: 1 },
  empty: { alignItems: 'center', paddingTop: SPACING.xl * 3, gap: SPACING.md },
  emptyIcon: { fontSize: 40, color: c.border, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.serif, color: c.textSub },
  emptySubtitle: { fontSize: 14, fontFamily: FONTS.sans, color: c.muted, textAlign: 'center', paddingHorizontal: SPACING.xl },
  })
}

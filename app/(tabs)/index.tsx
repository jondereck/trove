import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { Save, Collection, OrganizeSuggestion } from '../../types'
import SaveCard from '../../components/SaveCard'
import AIOrganize from '../../components/AIOrganize'
import { fetchLibrarySaves, fetchInboxSaves, fetchCollections, fetchProfile } from '../../lib/db'
import { applyOrganizeSuggestions } from '../../lib/organize'
import { supabase } from '../../lib/supabase'

type FilterId = 'all' | 'fav' | 'link' | 'image' | 'video' | 'note'

const CHIPS: { id: FilterId; label: string; icon?: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'all', label: 'All' },
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
  if (h >= 17 && h < 21) return 'Good evening'
  return 'Good night'
}

function handleSignOut() {
  Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
  ])
}

export default function LibraryScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [saves, setSaves] = useState<Save[]>([])
  const [inboxSaves, setInboxSaves] = useState<Save[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userName, setUserName] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterId>('all')
  const [aiVisible, setAiVisible] = useState(false)

  const loadData = useCallback(async () => {
    const [lib, inbox, cols] = await Promise.all([
      fetchLibrarySaves(),
      fetchInboxSaves(),
      fetchCollections(),
    ])
    setSaves(lib)
    setInboxSaves(inbox)
    setCollections(cols)
  }, [])

  useEffect(() => {
    fetchProfile().then(p => setUserName(p?.first_name ?? null))
  }, [])

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
    const acceptedIds = new Set(accepted.map(a => a.save.id))
    setInboxSaves(prev => prev.filter(s => !acceptedIds.has(s.id)))
    await applyOrganizeSuggestions(accepted)
    await loadData()
  }, [loadData])

  const shown = useMemo(
    () =>
      saves.filter(s => {
        if (filter === 'all') return true
        if (filter === 'fav') return s.is_favorite
        return s.type === filter
      }),
    [saves, filter]
  )

  const leftCol = shown.filter((_, i) => i % 2 === 0)
  const rightCol = shown.filter((_, i) => i % 2 === 1)

  const dateLabel = new Date()
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase()

  return (
    <>
      <ScrollView
        style={[styles.container, { paddingTop: insets.top }]}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} colors={[COLORS.accent]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greetingTop}>{getGreeting()},</Text>
            <Text style={styles.greetingName} numberOfLines={1}>{userName ?? 'there'}.</Text>
            <View style={styles.subRow}>
              <Text style={styles.kicker}>{saves.length} SAVED</Text>
              <View style={styles.dot} />
              <Text style={styles.kickerAccent}>{dateLabel}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.avatar} onPress={handleSignOut} activeOpacity={0.75}>
            <Text style={styles.avatarText}>{userName ? userName.charAt(0).toUpperCase() : '?'}</Text>
          </TouchableOpacity>
        </View>

        {shown.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>◇</Text>
            <Text style={styles.emptyTitle}>Nothing saved yet</Text>
            <Text style={styles.emptySubtitle}>Tap + to save your first link, note, or image.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            <View style={styles.col}>
              {leftCol.map(save => <SaveCard key={save.id} save={save} onPress={() => router.push(`/save/${save.id}`)} />)}
            </View>
            <View style={styles.col}>
              {rightCol.map(save => <SaveCard key={save.id} save={save} onPress={() => router.push(`/save/${save.id}`)} />)}
            </View>
          </View>
        )}
      </ScrollView>

      <AIOrganize
        visible={aiVisible}
        onClose={() => setAiVisible(false)}
        saves={inboxSaves}
        collections={collections}
        onApply={handleApply}
      />
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: SPACING.xl * 2 },

  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.lg,
  },
  headerLeft: { flex: 1 },
  greetingTop: { fontSize: 34, fontFamily: FONTS.serifItal, color: COLORS.muted, lineHeight: 38, letterSpacing: -0.5 },
  greetingName: { fontSize: 38, fontFamily: FONTS.serifItal, color: COLORS.text, lineHeight: 42, letterSpacing: -0.5 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.sm },
  kicker: { fontSize: 11, fontFamily: FONTS.mono, color: COLORS.muted, letterSpacing: 1 },
  kickerAccent: { fontSize: 11, fontFamily: FONTS.monoMed, color: COLORS.accent, letterSpacing: 1 },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: COLORS.muted },
  avatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center', marginTop: SPACING.sm,
  },
  avatarText: { fontSize: 14, fontFamily: FONTS.sansBold, color: '#fff' },

  chipScroll: { marginBottom: SPACING.lg },
  chipRow: { paddingHorizontal: SPACING.lg, gap: SPACING.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  chipOn: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  chipText: { fontSize: 13, fontFamily: FONTS.sansSemi, color: COLORS.text },
  chipTextOn: { color: '#fff' },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    marginHorizontal: SPACING.lg, marginBottom: SPACING.lg,
    padding: SPACING.md, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.accentSoft, borderWidth: 1, borderColor: COLORS.accentBorder,
  },
  bannerOrb: {
    width: 38, height: 38, borderRadius: 11, backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 14, fontFamily: FONTS.sansBold, color: COLORS.text },
  bannerSub: { fontSize: 12.5, fontFamily: FONTS.sans, color: COLORS.textSub, marginTop: 1 },
  bannerBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 999, backgroundColor: COLORS.accent },
  bannerBtnText: { fontSize: 13, fontFamily: FONTS.sansBold, color: '#fff' },

  loader: { marginTop: SPACING.xl * 3 },
  grid: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.lg },
  col: { flex: 1 },
  empty: { alignItems: 'center', paddingTop: SPACING.xl * 3, gap: SPACING.md },
  emptyIcon: { fontSize: 40, color: COLORS.border, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.serif, color: COLORS.textSub },
  emptySubtitle: { fontSize: 14, fontFamily: FONTS.sans, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.xl },
})

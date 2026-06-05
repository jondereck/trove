import { useCallback, useEffect, useState } from 'react'
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
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { Save } from '../../types'
import SaveCard from '../../components/SaveCard'
import { supabase } from '../../lib/supabase'
import { fetchLibrarySaves } from '../../lib/db'

// TODO: replace with supabase.auth.getUser() once profile table exists
const USER_NAME = 'Jon'

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function handleSignOut() {
  Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
  ])
}

export default function LibraryScreen() {
  const insets = useSafeAreaInsets()
  const [saves, setSaves] = useState<Save[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadSaves = useCallback(async () => {
    const data = await fetchLibrarySaves()
    setSaves(data)
  }, [])

  useEffect(() => {
    loadSaves().finally(() => setLoading(false))
  }, [loadSaves])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadSaves()
    setRefreshing(false)
  }, [loadSaves])

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
        <TouchableOpacity style={styles.avatar} onPress={handleSignOut} activeOpacity={0.75}>
          <Text style={styles.avatarText}>{USER_NAME.charAt(0).toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.accent} style={styles.loader} />
      ) : saves.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>◎</Text>
          <Text style={styles.emptyTitle}>Your library awaits</Text>
          <Text style={styles.emptySubtitle}>Tap + to save your first link, note, or image.</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          <View style={styles.col}>
            {leftCol.map(save => <SaveCard key={save.id} save={save} onPress={() => {}} />)}
          </View>
          <View style={styles.col}>
            {rightCol.map(save => <SaveCard key={save.id} save={save} onPress={() => {}} />)}
          </View>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl * 2 },
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
  greetingName: { color: COLORS.accent },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontFamily: FONTS.sansBold, color: '#fff' },
  loader: { marginTop: SPACING.xl * 3 },
  grid: { flexDirection: 'row', gap: SPACING.sm },
  col: { flex: 1 },
  empty: { alignItems: 'center', paddingTop: SPACING.xl * 4, gap: SPACING.md },
  emptyIcon: { fontSize: 40, color: COLORS.border, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.serif, color: COLORS.textSub },
  emptySubtitle: {
    fontSize: 14, fontFamily: FONTS.sans, color: COLORS.muted,
    textAlign: 'center', paddingHorizontal: SPACING.xl,
  },
})

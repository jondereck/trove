import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { DEFAULT_COLLECTION_ICON, IoniconName } from '../../constants/icons'
import { Save, Collection } from '../../types'
import { fetchCollectionById, fetchSavesByCollection } from '../../lib/db'
import SaveCard from '../../components/SaveCard'

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [collection, setCollection] = useState<Collection | null>(null)
  const [saves, setSaves] = useState<Save[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const [col, items] = await Promise.all([fetchCollectionById(id), fetchSavesByCollection(id)])
    setCollection(col)
    setSaves(items)
  }, [id])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const leftCol = saves.filter((_, i) => i % 2 === 0)
  const rightCol = saves.filter((_, i) => i % 2 === 1)

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
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
          {!loading && (
            <View style={[styles.countBadge, { backgroundColor: (collection?.color ?? COLORS.accent) + '22' }]}>
              <Text style={[styles.countText, { color: collection?.color ?? COLORS.accent }]}>
                {saves.length}
              </Text>
            </View>
          )}
        </View>
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
                  <SaveCard key={save.id} save={save} onPress={() => router.push(`/save/${save.id}`)} />
                ))}
              </View>
              <View style={styles.col}>
                {rightCol.map(save => (
                  <SaveCard key={save.id} save={save} onPress={() => router.push(`/save/${save.id}`)} />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.xs, marginRight: SPACING.sm },
  backText: { fontSize: 22, color: COLORS.text },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  name: { fontSize: 18, fontFamily: FONTS.serif, color: COLORS.text, flex: 1 },
  headerRight: { marginLeft: SPACING.sm },
  countBadge: { borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 3, minWidth: 28, alignItems: 'center' },
  countText: { fontSize: 12, fontFamily: FONTS.sansBold },
  loader: { marginTop: SPACING.xl * 3 },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
  grid: { flexDirection: 'row', gap: SPACING.sm },
  col: { flex: 1 },
  empty: { alignItems: 'center', paddingTop: SPACING.xl * 3, gap: SPACING.md },
  emptyIcon: { fontSize: 40, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.serif, color: COLORS.textSub },
  emptySubtitle: { fontSize: 14, fontFamily: FONTS.sans, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.xl },
})

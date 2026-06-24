import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { COLORS, FONTS, SPACING } from '../../constants/theme'
import { Save, Collection } from '../../types'
import SaveCard from '../../components/SaveCard'
import CollectionForm from '../../components/CollectionForm'
import { fetchCollection, fetchCollectionSaves } from '../../lib/db'

export default function CollectionDetailScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()

  const [collection, setCollection] = useState<Collection | null>(null)
  const [saves, setSaves] = useState<Save[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [formVisible, setFormVisible] = useState(false)

  const loadData = useCallback(async () => {
    if (!id) return
    const [col, items] = await Promise.all([fetchCollection(id), fetchCollectionSaves(id)])
    setCollection(col)
    setSaves(items)
  }, [id])

  useEffect(() => {
    loadData().finally(() => setLoading(false))
  }, [loadData])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [loadData])

  // After edit, refresh; after delete the collection is gone, so go back.
  const handleSaved = useCallback(async () => {
    if (!id) return
    const col = await fetchCollection(id)
    if (!col) { router.back(); return }
    setCollection(col)
    fetchCollectionSaves(id).then(setSaves)
  }, [id, router])

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
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backText}>‹ Collections</Text>
        </TouchableOpacity>
        {collection ? (
          <TouchableOpacity onPress={() => setFormVisible(true)} activeOpacity={0.7}>
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.header}>
        <Text style={styles.emoji}>{collection?.emoji ?? '📁'}</Text>
        <Text style={styles.title}>{collection?.name ?? 'Collection'}</Text>
        {collection?.description ? (
          <Text style={styles.description}>{collection.description}</Text>
        ) : null}
        <Text style={styles.count}>
          {saves.length} {saves.length === 1 ? 'save' : 'saves'}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.accent} style={styles.loader} />
      ) : saves.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>◎</Text>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptySubtitle}>Saves you add to this collection will appear here.</Text>
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

    <CollectionForm
      visible={formVisible}
      onClose={() => setFormVisible(false)}
      onSaved={handleSaved}
      collection={collection}
    />
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl * 2 },
  topRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: SPACING.sm, paddingBottom: SPACING.md,
  },
  backText: { fontSize: 15, fontFamily: FONTS.sansMed, color: COLORS.accent },
  editText: { fontSize: 15, fontFamily: FONTS.sansSemi, color: COLORS.accent },
  header: { paddingBottom: SPACING.xl, gap: SPACING.xs },
  emoji: { fontSize: 40 },
  title: { fontSize: 32, fontFamily: FONTS.serif, color: COLORS.text, letterSpacing: -0.5, marginTop: SPACING.sm },
  description: { fontSize: 14, fontFamily: FONTS.sans, color: COLORS.textSub, lineHeight: 20 },
  count: { fontSize: 12, fontFamily: FONTS.sansMed, color: COLORS.muted, marginTop: SPACING.xs, letterSpacing: 0.3 },
  loader: { marginTop: SPACING.xl * 3 },
  grid: { flexDirection: 'row', gap: SPACING.sm },
  col: { flex: 1 },
  empty: { alignItems: 'center', paddingTop: SPACING.xl * 3, gap: SPACING.md },
  emptyIcon: { fontSize: 40, color: COLORS.border, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.serif, color: COLORS.textSub },
  emptySubtitle: { fontSize: 14, fontFamily: FONTS.sans, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.xl },
})

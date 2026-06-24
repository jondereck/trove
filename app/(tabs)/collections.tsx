import { useCallback, useState } from 'react'
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { Collection } from '../../types'
import { fetchCollections } from '../../lib/db'
import CollectionForm from '../../components/CollectionForm'

// Append an alpha channel to a 6-digit hex color.
function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')
  return `${hex}${a}`
}

export default function CollectionsScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [formVisible, setFormVisible] = useState(false)

  const loadCollections = useCallback(async () => {
    const data = await fetchCollections()
    setCollections(data)
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadCollections().finally(() => setLoading(false))
    }, [loadCollections])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadCollections()
    setRefreshing(false)
  }, [loadCollections])

  const leftCol = collections.filter((_, i) => i % 2 === 0)
  const rightCol = collections.filter((_, i) => i % 2 === 1)

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
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>{collections.length} COLLECTIONS</Text>
            <Text style={styles.title}>Collections</Text>
          </View>
          <TouchableOpacity style={styles.newBtn} activeOpacity={0.75} onPress={() => setFormVisible(true)}>
            <Text style={styles.newBtnText}>New +</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.accent} style={styles.loader} />
        ) : collections.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>◈</Text>
            <Text style={styles.emptyTitle}>No collections yet</Text>
            <Text style={styles.emptySubtitle}>Create a collection to organize your saves.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            <View style={styles.gridCol}>
              {leftCol.map(col => (
                <CollectionCard key={col.id} collection={col} onPress={() => router.push(`/collection/${col.id}`)} />
              ))}
            </View>
            <View style={styles.gridCol}>
              {rightCol.map(col => (
                <CollectionCard key={col.id} collection={col} onPress={() => router.push(`/collection/${col.id}`)} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <CollectionForm visible={formVisible} onClose={() => setFormVisible(false)} onSaved={loadCollections} />
    </>
  )
}

function CollectionCard({ collection, onPress }: { collection: Collection; onPress: () => void }) {
  const c = collection.color || COLORS.accent
  const covers = collection.cover_urls ?? []
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.cover}>
        <View style={[styles.coverBig, { backgroundColor: withAlpha(c, 0.85) }]}>
          {covers[0]
            ? <Image source={{ uri: covers[0] }} style={styles.coverImg} resizeMode="cover" />
            : <Text style={styles.coverEmoji}>{collection.emoji}</Text>}
        </View>
        <View style={styles.coverSide}>
          <View style={[styles.coverSmall, { backgroundColor: withAlpha(c, 0.35) }]}>
            {covers[1] ? <Image source={{ uri: covers[1] }} style={styles.coverImg} resizeMode="cover" /> : null}
          </View>
          <View style={[styles.coverSmall, { backgroundColor: withAlpha(c, 0.2) }]}>
            {covers[2] ? <Image source={{ uri: covers[2] }} style={styles.coverImg} resizeMode="cover" /> : null}
          </View>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>{collection.name}</Text>
        <Text style={styles.cardMeta}>
          {collection.save_count ?? 0} {(collection.save_count ?? 0) === 1 ? 'item' : 'items'}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl * 2 },
  header: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingTop: SPACING.md, paddingBottom: SPACING.lg,
  },
  kicker: { fontSize: 11, fontFamily: FONTS.mono, color: COLORS.muted, letterSpacing: 1, marginBottom: 4 },
  title: { fontSize: 38, fontFamily: FONTS.serif, color: COLORS.text, letterSpacing: -0.5, lineHeight: 40 },
  newBtn: { backgroundColor: COLORS.accent, borderRadius: 999, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  newBtnText: { fontSize: 13, fontFamily: FONTS.sansSemi, color: '#fff' },
  loader: { marginTop: SPACING.xl * 3 },

  grid: { flexDirection: 'row', gap: SPACING.sm },
  gridCol: { flex: 1, gap: SPACING.sm },
  card: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden',
  },
  cover: { flexDirection: 'row', gap: 3, height: 96, padding: 8 },
  coverBig: { flex: 2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  coverEmoji: { fontSize: 30 },
  coverSide: { flex: 1, gap: 3 },
  coverSmall: { flex: 1, borderRadius: 8, overflow: 'hidden' },
  coverImg: { width: '100%', height: '100%' },
  cardBody: { padding: SPACING.md, paddingTop: SPACING.xs },
  cardName: { fontSize: 15, fontFamily: FONTS.sansBold, color: COLORS.text },
  cardMeta: { fontSize: 12, fontFamily: FONTS.sans, color: COLORS.muted, marginTop: 3 },

  empty: { alignItems: 'center', paddingTop: SPACING.xl * 4, gap: SPACING.md },
  emptyIcon: { fontSize: 40, color: COLORS.border, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.serif, color: COLORS.textSub },
  emptySubtitle: { fontSize: 14, fontFamily: FONTS.sans, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.xl },
})

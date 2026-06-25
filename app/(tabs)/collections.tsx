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
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { COLLECTION_ICONS, DEFAULT_COLLECTION_ICON, IoniconName } from '../../constants/icons'
import { Collection } from '../../types'
import { fetchCollections, createCollection } from '../../lib/db'

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
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [formVisible, setFormVisible] = useState(false)

  // Create modal state
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState<IoniconName>(DEFAULT_COLLECTION_ICON)
  const [newColor, setNewColor] = useState(COLORS.accent)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const slideY = useRef(new Animated.Value(SCREEN_HEIGHT)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current

  const loadCollections = useCallback(async () => {
    const data = await fetchCollections()
    setCollections(data)
  }, [])

  useEffect(() => { loadCollections().finally(() => setLoading(false)) }, [loadCollections])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadCollections()
    setRefreshing(false)
  }, [loadCollections])

  const openCreate = () => {
    setShowCreate(true)
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, damping: 22, mass: 0.85, stiffness: 200, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start()
  }

  const closeCreate = () => {
    Animated.parallel([
      Animated.timing(slideY, { toValue: SCREEN_HEIGHT, duration: 260, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setShowCreate(false)
      setNewName('')
      setNewIcon(DEFAULT_COLLECTION_ICON)
      setNewColor(COLORS.accent)
      setCreateError('')
    })
  }

  const handleCreate = async () => {
    if (!newName.trim() || creating) return
    setCreateError('')
    setCreating(true)

    const result = await createCollection({
      name: newName.trim(),
      icon: newIcon,
      color: newColor,
    })

    setCreating(false)

    if (!result) {
      // Supabase unique constraint rejects duplicate names per user
      setCreateError('A collection with this name already exists.')
      return
    }

    closeCreate()
    await loadCollections()
  }

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
          <View style={styles.headerText}>
            <Text style={styles.kicker}>{collections.length} COLLECTIONS</Text>
            <Text style={styles.title}>Collections</Text>
          </View>
          <TouchableOpacity style={styles.newBtn} onPress={openCreate} activeOpacity={0.75}>
            <Text style={styles.newBtnText}>New +</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.accent} style={styles.loader} />
        ) : collections.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>◈</Text>
            <Text style={styles.emptyTitle}>No collections yet</Text>
            <Text style={styles.emptySubtitle}>Tap "New +" to create your first collection.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            <View style={styles.col}>
              {collections.filter((_, i) => i % 2 === 0).map(col => (
                <CollectionCard key={col.id} collection={col} onPress={() => router.push(`/collection/${col.id}`)} />
              ))}
            </View>
            <View style={styles.col}>
              {collections.filter((_, i) => i % 2 === 1).map(col => (
                <CollectionCard key={col.id} collection={col} onPress={() => router.push(`/collection/${col.id}`)} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Create Collection Modal */}
      <Modal transparent visible={showCreate} animationType="none" onRequestClose={closeCreate}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeCreate} activeOpacity={1} />
        </Animated.View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kvWrap} pointerEvents="box-none">
          <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg, transform: [{ translateY: slideY }] }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>New Collection</Text>

            {/* Name */}
            <Text style={styles.label}>NAME</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={v => { setNewName(v); setCreateError('') }}
              placeholder="e.g. Design Inspiration"
              placeholderTextColor={COLORS.muted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />

            {createError ? <Text style={styles.errorText}>{createError}</Text> : null}

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
                    <Ionicons name={name} size={20} color={active ? newColor : COLORS.textSub} />
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
    </>
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

function CollectionCard({ collection, onPress }: { collection: Collection; onPress: () => void }) {
  const covers = collection.cover_urls ?? []
  const color = collection.color || COLORS.accent
  const count = collection.save_count ?? 0

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
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
  headerText: { flex: 1 },
  kicker: { fontSize: 11, fontFamily: FONTS.mono, color: COLORS.muted, letterSpacing: 1, marginBottom: 4 },
  title: { fontSize: 38, fontFamily: FONTS.serif, color: COLORS.text, letterSpacing: -0.5, lineHeight: 40 },
  newBtn: { backgroundColor: COLORS.accent, borderRadius: 999, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  newBtnText: { fontSize: 13, fontFamily: FONTS.sansSemi, color: '#fff' },
  loader: { marginTop: SPACING.xl * 3 },

  // 2-column grid
  grid: { flexDirection: 'row', gap: 14 },
  col: { flex: 1, gap: 14 },

  // Collection card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: '#281e14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 2,
  },
  cover: { flexDirection: 'row', gap: 3, height: 96, padding: 8, backgroundColor: COLORS.cream },
  coverBig: { flex: 2, height: '100%', borderRadius: 10 },
  coverColumn: { flex: 1, gap: 3 },
  coverSmall: { flex: 1, width: '100%' },
  cardBody: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14 },
  cardName: { fontSize: 15, fontFamily: FONTS.sansBold, color: COLORS.text },
  cardMeta: { fontSize: 12, fontFamily: FONTS.sans, color: COLORS.muted, marginTop: 3 },

  // Empty
  empty: { alignItems: 'center', paddingTop: SPACING.xl * 4, gap: SPACING.md },
  emptyIcon: { fontSize: 40, color: COLORS.border, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.serif, color: COLORS.textSub },
  emptySubtitle: { fontSize: 14, fontFamily: FONTS.sans, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.xl },

  // Modal
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  kvWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.cream, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 20,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, marginBottom: SPACING.lg },
  sheetTitle: { fontSize: 20, fontFamily: FONTS.serif, color: COLORS.text, marginBottom: SPACING.lg },
  label: { fontSize: 10, fontFamily: FONTS.sansSemi, color: COLORS.muted, letterSpacing: 1, marginBottom: SPACING.sm, marginTop: SPACING.md },
  input: {
    backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    fontSize: 15, fontFamily: FONTS.sans, color: COLORS.text,
  },
  errorText: { fontSize: 12, fontFamily: FONTS.sans, color: '#dc2626', marginTop: SPACING.xs },
  iconRow: { marginBottom: SPACING.sm },
  iconBtn: {
    width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'transparent', marginRight: SPACING.sm,
  },
  iconBtnActive: { borderColor: COLORS.accent, backgroundColor: '#fdf0eb' },
  colorRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSwatchActive: { borderWidth: 3, borderColor: COLORS.text },
  preview: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.card, borderRadius: RADIUS.md, borderLeftWidth: 4,
    padding: SPACING.md, marginBottom: SPACING.lg,
  },
  previewName: { fontSize: 15, fontFamily: FONTS.sansMed, color: COLORS.text, flex: 1 },
  createBtn: { borderRadius: RADIUS.md, paddingVertical: SPACING.md + 2, alignItems: 'center' },
  createBtnDisabled: { opacity: 0.45 },
  createBtnText: { fontSize: 15, fontFamily: FONTS.sansSemi, color: '#fff', letterSpacing: 0.2 },
})

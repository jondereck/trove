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
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { Collection } from '../../types'
import { fetchCollections, createCollection } from '../../lib/db'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

const EMOJI_OPTIONS = ['📁','📌','🎨','💻','📚','🎵','🌿','⭐','🔬','💡','🍳','✈','💪','🎯','🧠']
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
  const [newEmoji, setNewEmoji] = useState('📁')
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
      setNewEmoji('📁')
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
      emoji: newEmoji,
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
          <Text style={styles.title}>Collections</Text>
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
          <View style={styles.list}>
            {collections.map(col => (
              <CollectionCard key={col.id} collection={col} onPress={() => router.push(`/collection/${col.id}`)} />
            ))}
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

            {/* Emoji */}
            <Text style={styles.label}>EMOJI</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiRow}>
              {EMOJI_OPTIONS.map(e => (
                <TouchableOpacity
                  key={e}
                  style={[styles.emojiBtn, newEmoji === e && styles.emojiBtnActive]}
                  onPress={() => setNewEmoji(e)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.emojiText}>{e}</Text>
                </TouchableOpacity>
              ))}
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
              <Text style={styles.previewEmoji}>{newEmoji}</Text>
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

function CollectionCard({ collection, onPress }: { collection: Collection; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.colorStrip, { backgroundColor: collection.color }]} />
      <View style={styles.cardContent}>
        <View style={styles.cardLeft}>
          <Text style={styles.emoji}>{collection.emoji}</Text>
          <View style={styles.cardText}>
            <Text style={styles.cardName}>{collection.name}</Text>
            {collection.description
              ? <Text style={styles.cardDesc} numberOfLines={1}>{collection.description}</Text>
              : null}
          </View>
        </View>
        <View style={styles.cardRight}>
          <View style={[styles.countBadge, { backgroundColor: COLORS.cream }]}>
            <Text style={[styles.countText, { color: collection.color }]}>{collection.save_count ?? 0}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>
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
  list: { gap: SPACING.sm },

  // Collection card
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', overflow: 'hidden' },
  colorStrip: { width: 4 },
  cardContent: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.md, gap: SPACING.md },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1 },
  emoji: { fontSize: 22, width: 32, textAlign: 'center' },
  cardText: { flex: 1, gap: 2 },
  cardName: { fontSize: 16, fontFamily: FONTS.sansSemi, color: COLORS.text },
  cardDesc: { fontSize: 12, fontFamily: FONTS.sans, color: COLORS.muted },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  countBadge: { borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 3, minWidth: 28, alignItems: 'center' },
  countText: { fontSize: 12, fontFamily: FONTS.sansBold },
  chevron: { fontSize: 20, color: COLORS.muted, fontFamily: FONTS.sans, marginRight: 4 },

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
  emojiRow: { marginBottom: SPACING.sm },
  emojiBtn: {
    width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'transparent', marginRight: SPACING.sm,
  },
  emojiBtnActive: { borderColor: COLORS.accent, backgroundColor: '#fdf0eb' },
  emojiText: { fontSize: 20 },
  colorRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSwatchActive: { borderWidth: 3, borderColor: COLORS.text },
  preview: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.card, borderRadius: RADIUS.md, borderLeftWidth: 4,
    padding: SPACING.md, marginBottom: SPACING.lg,
  },
  previewEmoji: { fontSize: 20 },
  previewName: { fontSize: 15, fontFamily: FONTS.sansMed, color: COLORS.text, flex: 1 },
  createBtn: { borderRadius: RADIUS.md, paddingVertical: SPACING.md + 2, alignItems: 'center' },
  createBtnDisabled: { opacity: 0.45 },
  createBtnText: { fontSize: 15, fontFamily: FONTS.sansSemi, color: '#fff', letterSpacing: 0.2 },
})

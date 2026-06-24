import { useEffect, useRef, useState } from 'react'
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Animated,
  Dimensions,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS, FONTS, SPACING, RADIUS } from '../constants/theme'
import { Collection } from '../types'
import { createCollection, updateCollection, deleteCollection } from '../lib/db'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

const EMOJI_OPTS = ['📁', '📚', '🎨', '💡', '🎬', '🍳', '✈️', '💼', '🎵', '🧠', '❤️', '🔖', '🌱', '⭐', '🛠️', '📷']
const COLOR_OPTS = ['#c0613c', '#3c7dc0', '#3cc06f', '#9b3cc0', '#c0a13c', '#c03c5e', '#3cb5c0', '#6b6b6b']

interface CollectionFormProps {
  visible: boolean
  onClose: () => void
  /** Called after a successful create/update/delete so the parent can refresh. */
  onSaved: () => void
  /** When provided, the sheet is in edit mode. */
  collection?: Collection | null
}

export default function CollectionForm({ visible, onClose, onSaved, collection }: CollectionFormProps) {
  const insets = useSafeAreaInsets()
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current
  const isEdit = !!collection

  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(EMOJI_OPTS[0])
  const [color, setColor] = useState(COLOR_OPTS[0])
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  // Hydrate fields whenever the sheet opens
  useEffect(() => {
    if (visible) {
      setName(collection?.name ?? '')
      setEmoji(collection?.emoji ?? EMOJI_OPTS[0])
      setColor(collection?.color ?? COLOR_OPTS[0])
      setDescription(collection?.description ?? '')
      setSaving(false)
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, damping: 22, mass: 0.85, stiffness: 200, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 260, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start()
    }
  }, [visible, collection])

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    const ok = isEdit
      ? await updateCollection(collection!.id, { name: trimmed, emoji, color, description: description.trim() || undefined })
      : !!(await createCollection({ name: trimmed, emoji, color, description: description.trim() || undefined }))
    setSaving(false)
    if (ok) {
      onSaved()
      onClose()
    } else {
      Alert.alert('Error', `Could not ${isEdit ? 'update' : 'create'} the collection. Please try again.`)
    }
  }

  const handleDelete = () => {
    if (!collection) return
    Alert.alert('Delete collection', 'Saves in this collection will become uncategorized. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const ok = await deleteCollection(collection.id)
          if (ok) {
            onSaved()
            onClose()
          } else {
            Alert.alert('Error', 'Could not delete the collection. Please try again.')
          }
        },
      },
    ])
  }

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kvWrap} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg, transform: [{ translateY }] }]}>
          <View style={styles.handle} />

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{isEdit ? 'Edit Collection' : 'New Collection'}</Text>

            {/* Preview */}
            <View style={styles.preview}>
              <View style={[styles.previewStrip, { backgroundColor: color }]} />
              <Text style={styles.previewEmoji}>{emoji}</Text>
              <Text style={styles.previewName}>{name.trim() || 'Collection name'}</Text>
            </View>

            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Design Inspiration"
              placeholderTextColor={COLORS.muted}
              returnKeyType="done"
            />

            <Text style={styles.label}>Icon</Text>
            <View style={styles.optionGrid}>
              {EMOJI_OPTS.map(e => (
                <TouchableOpacity
                  key={e}
                  style={[styles.emojiOpt, emoji === e && styles.emojiOptActive]}
                  onPress={() => setEmoji(e)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.emojiOptText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Color</Text>
            <View style={styles.optionGrid}>
              {COLOR_OPTS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorOpt, { backgroundColor: c }, color === c && styles.colorOptActive]}
                  onPress={() => setColor(c)}
                  activeOpacity={0.7}
                />
              ))}
            </View>

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.descInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="Optional"
              placeholderTextColor={COLORS.muted}
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.primaryBtn, (!name.trim() || saving) && styles.btnDisabled]}
              onPress={handleSave}
              disabled={!name.trim() || saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>{isEdit ? 'Save changes' : 'Create collection'}</Text>}
            </TouchableOpacity>

            {isEdit && (
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.7}>
                <Text style={styles.deleteBtnText}>Delete collection</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  kvWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.cream,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
    maxHeight: '90%',
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, marginBottom: SPACING.lg },
  title: { fontSize: 20, fontFamily: FONTS.serif, color: COLORS.text, marginBottom: SPACING.lg },

  preview: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden', paddingRight: SPACING.md, marginBottom: SPACING.lg, minHeight: 56,
  },
  previewStrip: { width: 5, alignSelf: 'stretch' },
  previewEmoji: { fontSize: 22, marginLeft: SPACING.md },
  previewName: { flex: 1, fontSize: 16, fontFamily: FONTS.sansSemi, color: COLORS.text },

  label: {
    fontSize: 11, fontFamily: FONTS.sansSemi, color: COLORS.muted,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SPACING.sm, marginTop: SPACING.md,
  },
  input: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    fontSize: 15, fontFamily: FONTS.sans, color: COLORS.text,
  },
  descInput: { minHeight: 64 },

  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  emojiOpt: {
    width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.border,
  },
  emojiOptActive: { borderColor: COLORS.accent, backgroundColor: '#fdf0eb' },
  emojiOptText: { fontSize: 20 },
  colorOpt: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: 'transparent' },
  colorOptActive: { borderColor: COLORS.text },

  primaryBtn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingVertical: SPACING.md, alignItems: 'center', marginTop: SPACING.xl },
  btnDisabled: { opacity: 0.45 },
  primaryBtnText: { fontSize: 15, fontFamily: FONTS.sansSemi, color: '#fff', letterSpacing: 0.2 },
  deleteBtn: { alignItems: 'center', paddingVertical: SPACING.md, marginTop: SPACING.xs },
  deleteBtnText: { fontSize: 14, fontFamily: FONTS.sansSemi, color: '#c0392b' },
})

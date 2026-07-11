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
  Image,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SPACING, RADIUS } from '../constants/theme'
import { COLLECTION_ICONS, DEFAULT_COLLECTION_ICON, IoniconName } from '../constants/icons'
import { Collection } from '../types'
import { createCollection, updateCollection, deleteCollection } from '../lib/db'
import { isLimitError, showLimitAlert } from '../lib/upgradeAlert'
import { pickAndUploadCollectionCover } from '../lib/storage'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

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
  const [icon, setIcon] = useState<IoniconName>(DEFAULT_COLLECTION_ICON)
  const [color, setColor] = useState(COLOR_OPTS[0])
  const [description, setDescription] = useState('')
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)

  useEffect(() => {
    if (visible) {
      setName(collection?.name ?? '')
      setIcon((collection?.icon as IoniconName) ?? DEFAULT_COLLECTION_ICON)
      setColor(collection?.color ?? COLOR_OPTS[0])
      setDescription(collection?.description ?? '')
      setCoverUrl(collection?.cover_image_url ?? null)
      setSaving(false)
      setUploadingCover(false)
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

  const handlePickCover = async () => {
    if (uploadingCover) return
    setUploadingCover(true)
    try {
      const url = await pickAndUploadCollectionCover()
      if (url) setCoverUrl(url)
    } catch (e: any) {
      Alert.alert('Could not set cover', e?.message ?? String(e))
    } finally {
      setUploadingCover(false)
    }
  }

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    const payload = {
      name: trimmed,
      icon,
      color,
      description: description.trim() || undefined,
      cover_image_url: coverUrl,
    }
    let ok = false
    try {
      ok = isEdit
        ? await updateCollection(collection!.id, payload)
        : !!(await createCollection(payload))
    } catch (e) {
      setSaving(false)
      if (isLimitError(e)) {
        onClose()
        showLimitAlert(e)
        return
      }
      Alert.alert('Error', `Could not ${isEdit ? 'update' : 'create'} the collection. Please try again.`)
      return
    }
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
    const count = collection.save_count ?? 0
    if (count > 0) {
      Alert.alert(
        'Collection not empty',
        `"${collection.name}" has ${count} ${count === 1 ? 'item' : 'items'}. Move or delete them before removing this collection.`,
        [{ text: 'OK' }]
      )
      return
    }
    Alert.alert(
      'Delete collection?',
      `"${collection.name}" will be permanently removed. This cannot be undone.`,
      [
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
      ]
    )
  }

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kvWrap} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg, transform: [{ translateY }] }]}>
          <View style={styles.handle} />

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{isEdit ? 'Edit Collection' : 'New Collection'}</Text>

            <Text style={styles.label}>Cover</Text>
            <TouchableOpacity style={styles.coverPick} onPress={handlePickCover} activeOpacity={0.8} disabled={uploadingCover}>
              {coverUrl ? (
                <Image source={{ uri: coverUrl }} style={styles.coverImage} resizeMode="cover" />
              ) : (
                <View style={styles.coverPlaceholder}>
                  <Ionicons name="image-outline" size={28} color={COLORS.muted} />
                  <Text style={styles.coverHint}>Use recent save thumbnails</Text>
                </View>
              )}
              <View style={styles.coverOverlay}>
                {uploadingCover ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="camera" size={16} color="#fff" />
                    <Text style={styles.coverOverlayText}>{coverUrl ? 'Change cover' : 'Set cover'}</Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
            {coverUrl ? (
              <TouchableOpacity onPress={() => setCoverUrl(null)} activeOpacity={0.7} style={styles.clearCover}>
                <Text style={styles.clearCoverText}>Use recent thumbnails instead</Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.preview}>
              <View style={[styles.previewStrip, { backgroundColor: color }]} />
              <Ionicons name={icon} size={22} color={color} style={styles.previewIcon} />
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
              {COLLECTION_ICONS.map(iconName => {
                const active = icon === iconName
                return (
                  <TouchableOpacity
                    key={iconName}
                    style={[styles.iconOpt, active && styles.iconOptActive]}
                    onPress={() => setIcon(iconName)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={iconName} size={20} color={active ? color : COLORS.textSub} />
                  </TouchableOpacity>
                )
              })}
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

  coverPick: {
    height: 120,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  coverImage: { width: '100%', height: '100%' },
  coverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.cream,
  },
  coverHint: { fontSize: 12, fontFamily: FONTS.sans, color: COLORS.muted },
  coverOverlay: {
    position: 'absolute',
    right: SPACING.sm,
    bottom: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  coverOverlayText: { fontSize: 12, fontFamily: FONTS.sansSemi, color: '#fff' },
  clearCover: { alignSelf: 'flex-start', marginBottom: SPACING.md },
  clearCoverText: { fontSize: 13, fontFamily: FONTS.sansMed, color: COLORS.accent },

  preview: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden', paddingRight: SPACING.md, marginBottom: SPACING.lg, minHeight: 56,
  },
  previewStrip: { width: 5, alignSelf: 'stretch' },
  previewIcon: { marginLeft: SPACING.md },
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
  iconOpt: {
    width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.border,
  },
  iconOptActive: { borderColor: COLORS.accent, backgroundColor: '#fdf0eb' },
  colorOpt: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: 'transparent' },
  colorOptActive: { borderColor: COLORS.text },

  primaryBtn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingVertical: SPACING.md, alignItems: 'center', marginTop: SPACING.xl },
  btnDisabled: { opacity: 0.45 },
  primaryBtnText: { fontSize: 15, fontFamily: FONTS.sansSemi, color: '#fff', letterSpacing: 0.2 },
  deleteBtn: { alignItems: 'center', paddingVertical: SPACING.md, marginTop: SPACING.xs },
  deleteBtnText: { fontSize: 14, fontFamily: FONTS.sansSemi, color: '#c0392b' },
})

import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { Save, Collection } from '../../types'
import { fetchSave, fetchCollections, updateSave, deleteSave } from '../../lib/db'

function getDomain(url?: string): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export default function SaveDetailScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()

  const [save, setSave] = useState<Save | null>(null)
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [collectionId, setCollectionId] = useState<string | undefined>(undefined)
  const [favorite, setFavorite] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([fetchSave(id), fetchCollections()]).then(([s, cols]) => {
      setCollections(cols)
      if (s) {
        setSave(s)
        setTitle(s.title)
        setDescription(s.description ?? '')
        setTags(s.tags ?? [])
        setCollectionId(s.collection_id)
        setFavorite(s.is_favorite ?? false)
      }
      setLoading(false)
    })
  }, [id])

  const addTag = useCallback(() => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-').replace(/#/g, '')
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput('')
  }, [tagInput, tags])

  const removeTag = useCallback((t: string) => {
    setTags(prev => prev.filter(x => x !== t))
  }, [])

  const handleSave = useCallback(async () => {
    if (!save) return
    setSaving(true)
    const ok = await updateSave(save.id, {
      title: title.trim() || save.title,
      description: description.trim() || undefined,
      tags,
      collection_id: collectionId,
      is_favorite: favorite,
      // assigning a collection moves it out of the inbox
      is_inbox: collectionId ? false : save.is_inbox,
    })
    setSaving(false)
    if (ok) router.back()
    else Alert.alert('Error', 'Could not save changes. Please try again.')
  }, [save, title, description, tags, collectionId, router])

  const handleDelete = useCallback(() => {
    if (!save) return
    Alert.alert('Delete save', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const ok = await deleteSave(save.id)
          if (ok) router.back()
          else Alert.alert('Error', 'Could not delete. Please try again.')
        },
      },
    ])
  }, [save, router])

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    )
  }

  if (!save) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.missingTitle}>Save not found</Text>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.75}>
          <Text style={styles.missingLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const domain = getDomain(save.url)

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.iconBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setFavorite(f => !f)} activeOpacity={0.7}>
            <Ionicons
              name={favorite ? 'star' : 'star-outline'}
              size={22}
              color={favorite ? COLORS.accent : COLORS.muted}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={handleDelete} activeOpacity={0.7}>
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {save.image_url ? (
          <Image source={{ uri: save.image_url }} style={styles.hero} resizeMode="cover" />
        ) : null}

        {domain ? (
          <TouchableOpacity
            style={styles.domainPill}
            onPress={() => save.url && Linking.openURL(save.url)}
            activeOpacity={0.7}
          >
            <Text style={styles.domainText}>{domain}</Text>
            <Text style={styles.openText}>Open ↗</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          multiline
          placeholder="Untitled"
          placeholderTextColor={COLORS.muted}
        />

        {save.type === 'note' && save.content ? (
          <>
            <Text style={styles.label}>Note</Text>
            <Text style={styles.noteContent}>{save.content}</Text>
          </>
        ) : null}

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.descInput}
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder="Add a description…"
          placeholderTextColor={COLORS.muted}
        />

        <Text style={styles.label}>Tags</Text>
        <View style={styles.tagRow}>
          {tags.map(t => (
            <TouchableOpacity key={t} style={styles.tagChip} onPress={() => removeTag(t)} activeOpacity={0.7}>
              <Text style={styles.tagText}>{t}</Text>
              <Text style={styles.tagRemove}>✕</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.tagInput}
          value={tagInput}
          onChangeText={setTagInput}
          onSubmitEditing={addTag}
          placeholder="Add a tag…"
          placeholderTextColor={COLORS.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />

        <Text style={styles.label}>Collection</Text>
        <View style={styles.collectionWrap}>
          <TouchableOpacity
            style={[styles.colChip, !collectionId && styles.colChipActive]}
            onPress={() => setCollectionId(undefined)}
            activeOpacity={0.75}
          >
            <Text style={[styles.colChipText, !collectionId && styles.colChipTextActive]}>None</Text>
          </TouchableOpacity>
          {collections.map(col => {
            const active = collectionId === col.id
            return (
              <TouchableOpacity
                key={col.id}
                style={[styles.colChip, active && styles.colChipActive]}
                onPress={() => setCollectionId(col.id)}
                activeOpacity={0.75}
              >
                <Text style={styles.colEmoji}>{col.emoji}</Text>
                <Text style={[styles.colChipText, active && styles.colChipTextActive]}>{col.name}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>

      {/* Sticky save button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>Save changes</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  missingTitle: { fontSize: 20, fontFamily: FONTS.serif, color: COLORS.textSub },
  missingLink: { fontSize: 14, fontFamily: FONTS.sansSemi, color: COLORS.accent },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm,
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  iconBtn: { minWidth: 44, height: 36, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 30, color: COLORS.text, fontFamily: FONTS.sans, marginTop: -4 },
  deleteText: { fontSize: 14, fontFamily: FONTS.sansSemi, color: '#c0392b' },

  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl * 2 },
  hero: { width: '100%', height: 180, borderRadius: RADIUS.lg, marginBottom: SPACING.md },

  domainPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  domainText: { fontSize: 13, fontFamily: FONTS.sansMed, color: COLORS.textSub },
  openText: { fontSize: 13, fontFamily: FONTS.sansSemi, color: COLORS.accent },

  label: {
    fontSize: 11, fontFamily: FONTS.sansSemi, color: COLORS.muted,
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: SPACING.sm, marginTop: SPACING.lg,
  },
  titleInput: {
    fontSize: 24, fontFamily: FONTS.serif, color: COLORS.text, lineHeight: 30,
    padding: 0,
  },
  noteContent: {
    fontSize: 15, fontFamily: FONTS.serifItal, color: COLORS.text, lineHeight: 24,
    backgroundColor: COLORS.cream, borderRadius: RADIUS.md, padding: SPACING.md,
  },
  descInput: {
    fontSize: 15, fontFamily: FONTS.sans, color: COLORS.text, lineHeight: 22,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, padding: SPACING.md, minHeight: 80, textAlignVertical: 'top',
  },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  tagChip: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.accent + '18', borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: 5,
  },
  tagText: { fontSize: 13, fontFamily: FONTS.sansMed, color: COLORS.accent },
  tagRemove: { fontSize: 10, color: COLORS.accent, opacity: 0.7 },
  tagInput: {
    fontSize: 14, fontFamily: FONTS.sans, color: COLORS.text,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    marginTop: SPACING.sm,
  },

  collectionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  colChip: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  colChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  colEmoji: { fontSize: 14 },
  colChipText: { fontSize: 13, fontFamily: FONTS.sansMed, color: COLORS.text },
  colChipTextActive: { color: '#fff' },

  footer: {
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md,
    borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.bg,
  },
  saveBtn: {
    backgroundColor: COLORS.accent, borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontFamily: FONTS.sansSemi, color: '#fff' },
})

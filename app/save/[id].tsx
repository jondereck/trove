import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Image, Linking,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { DEFAULT_COLLECTION_ICON, IoniconName } from '../../constants/icons'
import { Save, Collection } from '../../types'
import { fetchSaveById, updateSave, deleteSave, fetchCollections } from '../../lib/db'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function getDomain(url?: string) {
  try { return url ? new URL(url).hostname.replace(/^www\./, '') : '' } catch { return '' }
}

const TYPE_COLORS: Record<string, string> = {
  link: '#3b82f6', note: '#8b5cf6', image: '#10b981', video: '#f59e0b',
}

export default function SaveDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [save, setSave] = useState<Save | null>(null)
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  // Edit state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [selectedCollection, setSelectedCollection] = useState<string | undefined>()

  const load = useCallback(async () => {
    const [s, cols] = await Promise.all([fetchSaveById(id), fetchCollections()])
    if (s) {
      setSave(s)
      setTitle(s.title)
      setDescription(s.description ?? '')
      setTags(s.tags ?? [])
      setSelectedCollection(s.collection_id ?? undefined)
    }
    setCollections(cols)
  }, [id])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  const handleSave = async () => {
    if (!save) return
    await updateSave(save.id, {
      title: title.trim() || save.title,
      description: description.trim() || undefined,
      tags,
      collection_id: selectedCollection,
    })
    setSave(prev => prev ? { ...prev, title, description, tags, collection_id: selectedCollection } : prev)
    setEditing(false)
  }

  const handleDelete = () => {
    Alert.alert('Delete Save', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          if (save) { await deleteSave(save.id); router.back() }
        },
      },
    ])
  }

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (t) setTags(prev => (prev.includes(t) ? prev : [...prev, t]))
    setTagInput('')
  }

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    )
  }

  if (!save) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.notFound}>Save not found.</Text>
      </View>
    )
  }

  const currentCollection = collections.find(c => c.id === (editing ? selectedCollection : save.collection_id))

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {editing ? (
            <>
              <TouchableOpacity onPress={() => setEditing(false)} style={styles.actionBtn} activeOpacity={0.7}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={[styles.actionBtn, styles.saveBtn]} activeOpacity={0.85}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => setEditing(true)} style={styles.actionBtn} activeOpacity={0.7}>
                <Text style={styles.editText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={styles.actionBtn} activeOpacity={0.7}>
                <Text style={styles.deleteText}>🗑</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Hero image */}
        {save.image_url && !editing && (
          <Image source={{ uri: save.image_url }} style={styles.heroImage} resizeMode="cover" />
        )}

        {/* Type + domain */}
        <View style={styles.metaRow}>
          <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[save.type] + '22' }]}>
            <Text style={[styles.typeBadgeText, { color: TYPE_COLORS[save.type] }]}>
              {save.type.toUpperCase()}
            </Text>
          </View>
          {save.url && (
            <TouchableOpacity onPress={() => save.url && Linking.openURL(save.url)} activeOpacity={0.7}>
              <Text style={styles.domain}>{getDomain(save.url)} ↗</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Title */}
        {editing ? (
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            multiline
            placeholder="Title"
            placeholderTextColor={COLORS.muted}
          />
        ) : (
          <Text style={styles.title}>{save.title}</Text>
        )}

        {/* Description / content */}
        {editing ? (
          <TextInput
            style={styles.descInput}
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="Description or note…"
            placeholderTextColor={COLORS.muted}
            textAlignVertical="top"
          />
        ) : (save.description || save.content) ? (
          <Text style={styles.description}>{save.description || save.content}</Text>
        ) : null}

        {/* Collection */}
        <Text style={styles.sectionLabel}>COLLECTION</Text>
        {editing ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colPicker}>
            <TouchableOpacity
              style={[styles.colChip, !selectedCollection && styles.colChipActive]}
              onPress={() => setSelectedCollection(undefined)}
              activeOpacity={0.7}
            >
              <Text style={[styles.colChipText, !selectedCollection && styles.colChipTextActive]}>None</Text>
            </TouchableOpacity>
            {collections.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.colChip, selectedCollection === c.id && styles.colChipActive]}
                onPress={() => setSelectedCollection(c.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={(c.icon as IoniconName) ?? DEFAULT_COLLECTION_ICON}
                  size={14}
                  color={selectedCollection === c.id ? COLORS.accent : c.color}
                />
                <Text style={[styles.colChipText, selectedCollection === c.id && styles.colChipTextActive]}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.colDisplay}>
            {currentCollection
              ? (
                <View style={styles.colNameRow}>
                  <Ionicons
                    name={(currentCollection.icon as IoniconName) ?? DEFAULT_COLLECTION_ICON}
                    size={15}
                    color={currentCollection.color}
                  />
                  <Text style={styles.colName}>{currentCollection.name}</Text>
                </View>
              )
              : <Text style={styles.colNone}>No collection</Text>
            }
          </View>
        )}

        {/* Tags */}
        <Text style={styles.sectionLabel}>TAGS</Text>
        <View style={styles.tagsRow}>
          {(editing ? tags : save.tags)?.map((tag, i) => (
            <TouchableOpacity
              key={`${tag}-${i}`}
              style={styles.tag}
              onPress={() => editing && setTags(t => t.filter(x => x !== tag))}
              activeOpacity={editing ? 0.7 : 1}
            >
              <Text style={styles.tagText}>{tag}{editing ? ' ×' : ''}</Text>
            </TouchableOpacity>
          ))}
          {editing && (
            <TextInput
              style={styles.tagInput}
              value={tagInput}
              onChangeText={setTagInput}
              placeholder="+ add"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={addTag}
              blurOnSubmit={false}
            />
          )}
        </View>

        <Text style={styles.date}>Saved {formatDate(save.created_at)}</Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  notFound: { fontFamily: FONTS.serif, fontSize: 18, color: COLORS.muted },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.xs },
  backText: { fontSize: 22, color: COLORS.text },
  headerActions: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  actionBtn: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  editText: { fontSize: 15, fontFamily: FONTS.sansMed, color: COLORS.accent },
  deleteText: { fontSize: 16 },
  cancelText: { fontSize: 15, fontFamily: FONTS.sans, color: COLORS.muted },
  saveBtn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md },
  saveBtnText: { fontSize: 14, fontFamily: FONTS.sansSemi, color: '#fff' },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2, gap: SPACING.md },
  heroImage: { width: '100%', height: 200, borderRadius: RADIUS.lg, marginBottom: SPACING.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  typeBadge: { borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  typeBadgeText: { fontSize: 10, fontFamily: FONTS.sansBold, letterSpacing: 0.8 },
  domain: { fontSize: 13, fontFamily: FONTS.sans, color: COLORS.accent },
  title: { fontSize: 22, fontFamily: FONTS.serif, color: COLORS.text, lineHeight: 30 },
  titleInput: {
    fontSize: 22, fontFamily: FONTS.serif, color: COLORS.text, lineHeight: 30,
    borderBottomWidth: 1.5, borderBottomColor: COLORS.accent, paddingVertical: SPACING.xs,
  },
  description: { fontSize: 15, fontFamily: FONTS.sans, color: COLORS.textSub, lineHeight: 22 },
  descInput: {
    fontSize: 15, fontFamily: FONTS.sans, color: COLORS.text, lineHeight: 22,
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    padding: SPACING.md, minHeight: 80,
  },
  sectionLabel: { fontSize: 10, fontFamily: FONTS.sansSemi, color: COLORS.muted, letterSpacing: 1, marginTop: SPACING.sm },
  colDisplay: { marginTop: SPACING.xs },
  colNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  colName: { fontSize: 14, fontFamily: FONTS.sansMed, color: COLORS.text },
  colNone: { fontSize: 14, fontFamily: FONTS.sans, color: COLORS.muted, fontStyle: 'italic' },
  colPicker: { marginTop: SPACING.xs },
  colChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, marginRight: SPACING.sm,
  },
  colChipActive: { borderColor: COLORS.accent, backgroundColor: '#fdf0eb' },
  colChipText: { fontSize: 13, fontFamily: FONTS.sans, color: COLORS.textSub },
  colChipTextActive: { color: COLORS.accent, fontFamily: FONTS.sansMed },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.xs },
  tag: { backgroundColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 4 },
  tagText: { fontSize: 12, fontFamily: FONTS.sansMed, color: COLORS.textSub },
  tagInput: {
    borderBottomWidth: 1.5, borderBottomColor: COLORS.accent, minWidth: 56,
    fontSize: 12, fontFamily: FONTS.sans, color: COLORS.text, paddingVertical: 2,
  },
  date: { fontSize: 12, fontFamily: FONTS.sans, color: COLORS.muted, marginTop: SPACING.md },
})

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Image, Linking,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { ColorPalette, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { useColors, useThemedStyles } from '../../contexts/ThemeContext'
import { DEFAULT_COLLECTION_ICON, IoniconName } from '../../constants/icons'
import { Save, Collection } from '../../types'
import { fetchSaveById, updateSave, deleteSave, fetchCollections } from '../../lib/db'
import { repairThumbnail } from '../../lib/thumbnailRepair'
import { syncAllDigestNotifications } from '../../lib/notificationsSync'
import SaveVideoPlayer from '../../components/SaveVideoPlayer'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function getDomain(url?: string) {
  try {
    if (!url || url.startsWith('file:')) return ''
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

const TYPE_COLORS: Record<string, string> = {
  link: '#3b82f6', note: '#8b5cf6', image: '#10b981', video: '#f59e0b',
}

export default function SaveDetailScreen() {
  const colors = useColors()
  const styles = useThemedStyles(createStyles)
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [save, setSave] = useState<Save | null>(null)
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [selectedCollection, setSelectedCollection] = useState<string | undefined>()
  const [refreshingPreview, setRefreshingPreview] = useState(false)
  const mountedRef = useRef(true)
  const saveRef = useRef<Save | null>(null)
  saveRef.current = save

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

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Mark viewed when leaving the detail screen so Library does not remount mid-push.
  useFocusEffect(
    useCallback(() => {
      return () => {
        const current = saveRef.current
        if (!current || current.is_viewed !== false) return
        void updateSave(current.id, { is_viewed: true }).then(ok => {
          if (ok && mountedRef.current) {
            setSave(prev => prev ? { ...prev, is_viewed: true } : prev)
          }
        })
      }
    }, []),
  )

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
    void syncAllDigestNotifications()
  }

  const handleDelete = () => {
    Alert.alert('Delete Save', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          if (save) {
            await deleteSave(save.id)
            void syncAllDigestNotifications()
            router.back()
          }
        },
      },
    ])
  }

  const handleRefreshPreview = async () => {
    if (!save || refreshingPreview) return
    setRefreshingPreview(true)
    const url = await repairThumbnail(save, { force: true })
    setRefreshingPreview(false)
    if (url) {
      setSave(prev => prev ? { ...prev, image_url: url } : prev)
    } else {
      Alert.alert('No preview found', 'This page did not offer a preview image.')
    }
  }

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (t) setTags(prev => (prev.includes(t) ? prev : [...prev, t]))
    setTagInput('')
  }

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.accent} />
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
  const domain = getDomain(save.url)
  const showVideoPlayer = !editing && save.type === 'video' && !!save.url

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
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
                <Ionicons name="trash-outline" size={22} color="#e53e3e" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {showVideoPlayer ? (
            <SaveVideoPlayer uri={save.url!} />
          ) : save.image_url && !editing ? (
            <Image source={{ uri: save.image_url }} style={styles.heroImage} resizeMode="cover" />
          ) : null}

          <View style={styles.metaRow}>
            <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[save.type] + '22' }]}>
              <Text style={[styles.typeBadgeText, { color: TYPE_COLORS[save.type] }]}>
                {save.type.toUpperCase()}
              </Text>
            </View>
            {domain ? (
              <TouchableOpacity onPress={() => save.url && Linking.openURL(save.url)} activeOpacity={0.7}>
                <Text style={styles.domain}>{domain} ↗</Text>
              </TouchableOpacity>
            ) : null}
            {!editing && save.type === 'link' && !!save.url && (
              <TouchableOpacity
                onPress={handleRefreshPreview}
                disabled={refreshingPreview}
                style={styles.refreshBtn}
                activeOpacity={0.7}
              >
                {refreshingPreview ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Ionicons name="refresh-outline" size={14} color={colors.accent} />
                )}
                <Text style={styles.refreshText}>Refresh preview</Text>
              </TouchableOpacity>
            )}
          </View>

          {editing ? (
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              multiline
              placeholder="Title"
              placeholderTextColor={colors.muted}
            />
          ) : (
            <Text style={styles.title}>{save.title}</Text>
          )}

          {editing ? (
            <TextInput
              style={styles.descInput}
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder="Description or note…"
              placeholderTextColor={colors.muted}
              textAlignVertical="top"
            />
          ) : (save.description || save.content) ? (
            <Text style={styles.description}>{save.description || save.content}</Text>
          ) : null}

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
                    color={selectedCollection === c.id ? colors.accent : c.color}
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
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={addTag}
                blurOnSubmit={false}
              />
            )}
          </View>

          <Text style={styles.date}>Saved {formatDate(save.created_at)}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    flex: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
    notFound: { fontFamily: FONTS.serif, fontSize: 18, color: c.muted },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn: { padding: SPACING.xs },
    backText: { fontSize: 22, color: c.text },
    headerActions: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
    actionBtn: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
    editText: { fontSize: 15, fontFamily: FONTS.sansMed, color: c.accent },
    cancelText: { fontSize: 15, fontFamily: FONTS.sans, color: c.muted },
    saveBtn: { backgroundColor: c.accent, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md },
    saveBtnText: { fontSize: 14, fontFamily: FONTS.sansSemi, color: '#fff' },
    content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2, gap: SPACING.md },
    heroImage: { width: '100%', height: 200, borderRadius: RADIUS.lg, marginBottom: SPACING.sm },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' },
    typeBadge: { borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
    typeBadgeText: { fontSize: 10, fontFamily: FONTS.sansBold, letterSpacing: 0.8 },
    domain: { fontSize: 13, fontFamily: FONTS.sans, color: c.accent },
    refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
    refreshText: { fontSize: 12, fontFamily: FONTS.sansMed, color: c.accent },
    title: { fontSize: 22, fontFamily: FONTS.serif, color: c.text, lineHeight: 30 },
    titleInput: {
      fontSize: 22, fontFamily: FONTS.serif, color: c.text, lineHeight: 30,
      borderBottomWidth: 1.5, borderBottomColor: c.accent, paddingVertical: SPACING.xs,
    },
    description: { fontSize: 15, fontFamily: FONTS.sans, color: c.textSub, lineHeight: 22 },
    descInput: {
      fontSize: 15, fontFamily: FONTS.sans, color: c.text, lineHeight: 22,
      borderWidth: 1.5, borderColor: c.border, borderRadius: RADIUS.md,
      padding: SPACING.md, minHeight: 120,
    },
    sectionLabel: { fontSize: 10, fontFamily: FONTS.sansSemi, color: c.muted, letterSpacing: 1, marginTop: SPACING.sm },
    colDisplay: { marginTop: SPACING.xs },
    colNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    colName: { fontSize: 14, fontFamily: FONTS.sansMed, color: c.text },
    colNone: { fontSize: 14, fontFamily: FONTS.sans, color: c.muted, fontStyle: 'italic' },
    colPicker: { marginTop: SPACING.xs },
    colChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      borderWidth: 1.5, borderColor: c.border, borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, marginRight: SPACING.sm,
    },
    colChipActive: { borderColor: c.accent, backgroundColor: c.accentSoft },
    colChipText: { fontSize: 13, fontFamily: FONTS.sans, color: c.textSub },
    colChipTextActive: { color: c.accent, fontFamily: FONTS.sansMed },
    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.xs },
    tag: { backgroundColor: c.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 4 },
    tagText: { fontSize: 12, fontFamily: FONTS.sansMed, color: c.textSub },
    tagInput: {
      borderBottomWidth: 1.5, borderBottomColor: c.accent, minWidth: 56,
      fontSize: 12, fontFamily: FONTS.sans, color: c.text, paddingVertical: 2,
    },
    date: { fontSize: 12, fontFamily: FONTS.sans, color: c.muted, marginTop: SPACING.md },
  })
}

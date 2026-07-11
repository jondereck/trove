import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
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
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { COLORS, FONTS, SPACING, RADIUS } from '../constants/theme'
import { UNSORTED_LABEL } from '../constants/labels'
import { DEFAULT_COLLECTION_ICON, IoniconName } from '../constants/icons'
import { SaveType, OGMetadata, AISuggestion, Collection } from '../types'
import { fetchOGMetadata, suggestForSave, suggestNoteTitle } from '../lib/ai'
import { fetchCollections, findSaveByUrl } from '../lib/db'
import { prepareMediaForUpload, uploadMedia } from '../lib/storage'
import { getSettings } from '../lib/settings'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

type Step = 'input' | 'loading' | 'preview'

export interface Draft {
  url: string
  type: SaveType
  title: string
  description: string
  imageUrl?: string
  collection: string
  tags: string[]
}

interface QuickSaveProps {
  visible: boolean
  onClose: () => void
  onSave?: (draft: Draft) => void
  /** Pre-fill a URL and immediately trigger fetch+suggest (used by share sheet). */
  initialUrl?: string
}

const TYPE_OPTS: { key: SaveType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'link', label: 'Link', icon: 'link-outline' },
  { key: 'note', label: 'Note', icon: 'create-outline' },
  { key: 'image', label: 'Image', icon: 'image-outline' },
  { key: 'video', label: 'Video', icon: 'videocam-outline' },
]

export default function QuickSave({ visible, onClose, onSave, initialUrl }: QuickSaveProps) {
  const insets = useSafeAreaInsets()
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current
  const didAutoFetch = useRef(false)
  // Read via ref so the value is current inside doFetchAndSuggest's closure.
  const autoOrganizeRef = useRef(true)
  const [aiTitleDescriptionOn, setAiTitleDescriptionOn] = useState(true)

  const [collections, setCollections] = useState<Collection[]>([])
  const [step, setStep] = useState<Step>('input')
  const [type, setType] = useState<SaveType>('link')
  const [input, setInput] = useState('')
  const [loadingStatus, setLoadingStatus] = useState('')
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editingTag, setEditingTag] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  // Collection selection in the preview step. '' = Inbox (unsorted).
  const [selectedCollection, setSelectedCollection] = useState('')
  const [showNewColl, setShowNewColl] = useState(false)
  const [newColl, setNewColl] = useState('')
  const [customColl, setCustomColl] = useState<string | null>(null)
  const [suggestingTitle, setSuggestingTitle] = useState(false)

  // Load real collections once on mount for AI suggestions
  useEffect(() => {
    fetchCollections().then(setCollections)
    getSettings().then(s => {
      autoOrganizeRef.current = s.autoOrganize
      setAiTitleDescriptionOn(s.aiSuggestTitleDescription)
    })
  }, [])

  // Core fetch+suggest logic — accepts an explicit URL so it can be called
  // both from the button (uses `input` state) and from the auto-fetch path.
  const doFetchAndSuggest = useCallback(async (url: string, saveType: SaveType = 'link') => {
    setError('')
    setStep('loading')

    // Stop early if this link is already saved.
    setLoadingStatus('Checking your library…')
    const dup = await findSaveByUrl(url)
    if (dup) {
      setError('This link is already in your library.')
      setStep('input')
      return
    }

    let meta: OGMetadata = { url, title: url }
    let suggestion: AISuggestion = { collection: 'Read Later', tags: [] }

    try {
      setLoadingStatus('Fetching page metadata…')
      meta = await fetchOGMetadata(url)
    } catch {
      try { meta.title = new URL(url).hostname } catch { /* keep raw url as title */ }
    }

    try {
      setLoadingStatus('Asking AI for suggestions…')
      suggestion = await suggestForSave(meta, collections)
    } catch {
      // Use defaults — never block the user on AI failure.
    }

    setDraft({
      url,
      type: saveType,
      title: meta.title,
      description: meta.description ?? '',
      imageUrl: meta.image,
      collection: suggestion.collection,
      tags: suggestion.tags,
    })

    // Auto-organize: pre-select the AI-suggested collection so the save files
    // straight into it. Off (or a "Read Later" default) leaves it in the Inbox.
    const suggested = suggestion.collection?.trim()
    if (autoOrganizeRef.current && suggested && suggested.toLowerCase() !== 'read later') {
      setSelectedCollection(suggested)
    }

    setStep('preview')
  }, [collections])

  // Slide the sheet in/out. When opening with initialUrl, skip the input step
  // and go straight to loading so the user sees the spinner immediately.
  useEffect(() => {
    if (visible) {
      fetchCollections().then(setCollections)
      getSettings().then(s => {
        autoOrganizeRef.current = s.autoOrganize
        setAiTitleDescriptionOn(s.aiSuggestTitleDescription)
      })
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, damping: 22, mass: 0.85, stiffness: 200, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start()

      if (initialUrl && !didAutoFetch.current) {
        didAutoFetch.current = true
        setInput(initialUrl)
        setType('link')
        doFetchAndSuggest(initialUrl, 'link')
      }
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 260, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        didAutoFetch.current = false
        setStep('input')
        setInput('')
        setError('')
        setDraft(null)
        setEditingTag('')
        setShowTagInput(false)
        setSelectedCollection('')
        setShowNewColl(false)
        setNewColl('')
        setCustomColl(null)
      })
    }
  }, [visible, initialUrl])

  const handleFetchAndSuggest = () => {
    if (!input.trim()) return
    doFetchAndSuggest(input.trim(), type)
  }

  // Pick an image/video from the gallery, upload it to Supabase Storage, then
  // drop into the preview step so the user can title + tag it before saving.
  const handlePickMedia = async (kind: SaveType) => {
    setError('')
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      setError('Photo library permission is required to import media.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'video' ? ['videos'] : ['images'],
      quality: 0.8,
      base64: true,
    })
    if (result.canceled || !result.assets?.length) return

    const asset = result.assets[0]
    setStep('loading')
    setLoadingStatus('Preparing media…')

    let publicUrl: string | null = null
    try {
      const media = await prepareMediaForUpload(asset, kind === 'video' ? 'video' : 'image')
      setLoadingStatus('Uploading to your library…')
      publicUrl = await uploadMedia(media.base64, media.ext, media.mime)
    } catch (e: any) {
      setError(e?.message ?? 'Could not read the selected file.')
      setStep('input')
      return
    }

    if (!publicUrl) {
      setError('Upload failed. Please try again.')
      setStep('input')
      return
    }

    setDraft({
      url: kind === 'video' ? publicUrl : '',
      type: kind,
      title: asset.fileName ?? (kind === 'video' ? 'Video' : 'Photo'),
      description: '',
      imageUrl: kind === 'image' ? publicUrl : undefined,
      collection: 'Read Later',
      tags: [],
    })
    setStep('preview')
  }

  const handleDirectSave = () => {
    if (!input.trim()) return
    const d: Draft = {
      url: input.trim(),
      type,
      title: input.trim(),
      description: '',
      collection: '',
      tags: [],
    }
    onSave?.(d)
    onClose()
  }

  // Note-specific flow: AI suggests a title, then show preview step.
  const handleNotePreview = async () => {
    if (!input.trim()) return
    setError('')

    const content = input.trim()
    let title = content.slice(0, 60)

    if (aiTitleDescriptionOn) {
      setStep('loading')
      setLoadingStatus('Thinking of a title…')
      try {
        const suggested = await suggestNoteTitle(content)
        if (suggested) title = suggested
      } catch { /* fall through to truncated content */ }
    }

    setDraft({
      url: '',
      type: 'note',
      title,
      description: content,
      imageUrl: undefined,
      collection: 'Read Later',
      tags: [],
    })
    setStep('preview')
  }

  // Re-suggest title for the current draft note.
  const handleResuggestTitle = async () => {
    if (!draft?.description || suggestingTitle || !aiTitleDescriptionOn) return
    setSuggestingTitle(true)
    try {
      const title = await suggestNoteTitle(draft.description)
      if (title) setDraft(d => d ? { ...d, title } : d)
    } catch { /* keep current */ }
    setSuggestingTitle(false)
  }

  const handleSaveDraft = () => {
    // Carry the manually chosen collection name ('' = stays in Inbox).
    if (draft) onSave?.({ ...draft, collection: selectedCollection })
    onClose()
  }

  // Build the selectable collection chips: Inbox + the AI suggestion (if it's a
  // new name) + any custom-typed name + all existing collections.
  const collOptions = useMemo(() => {
    const existing = new Set(collections.map(c => c.name.toLowerCase()))
    const sugg = draft?.collection?.trim()
    const suggIsNew = !!sugg && sugg.toLowerCase() !== 'read later' && !existing.has(sugg.toLowerCase())

    const opts: { id: string; label: string; icon?: IoniconName; color?: string; isNew?: boolean; recommended?: boolean }[] = [
      { id: '', label: UNSORTED_LABEL },
    ]
    if (suggIsNew) opts.push({ id: sugg!, label: sugg!, isNew: true, recommended: true })
    if (customColl && customColl.toLowerCase() !== sugg?.toLowerCase() && !existing.has(customColl.toLowerCase())) {
      opts.push({ id: customColl, label: customColl, isNew: true })
    }
    collections.forEach(c =>
      opts.push({ id: c.name, label: c.name, icon: c.icon as IoniconName, color: c.color, recommended: sugg?.toLowerCase() === c.name.toLowerCase() })
    )
    return opts
  }, [collections, draft?.collection, customColl])

  const commitNewColl = () => {
    const n = newColl.trim()
    if (n) {
      setCustomColl(n)
      setSelectedCollection(n)
    }
    setNewColl('')
    setShowNewColl(false)
  }

  const removeTag = (tag: string) =>
    setDraft(d => d ? { ...d, tags: d.tags.filter(t => t !== tag) } : d)

  const addTag = () => {
    const t = editingTag.trim().toLowerCase().replace(/\s+/g, '-')
    if (t) {
      setDraft(d =>
        d && !d.tags.includes(t) && d.tags.length < 5
          ? { ...d, tags: [...d.tags, t] }
          : d
      )
    }
    setEditingTag('')
    setShowTagInput(false)
  }

  const domain = (() => {
    try { return new URL(draft?.url ?? '').hostname.replace(/^www\./, '') } catch { return '' }
  })()

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kvWrap} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg, transform: [{ translateY }] }]}>
          <View style={styles.handle} />

          {/* ── INPUT STEP ── */}
          {step === 'input' && (
            <>
              <Text style={styles.title}>Quick Save</Text>

              <View style={styles.typeRow}>
                {TYPE_OPTS.map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.typePill, type === opt.key && styles.typePillActive]}
                    onPress={() => setType(opt.key)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={15}
                      color={type === opt.key ? COLORS.accent : COLORS.textSub}
                    />
                    <Text style={[styles.typePillText, type === opt.key && styles.typePillTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {type === 'image' || type === 'video' ? (
                <TouchableOpacity
                  style={styles.galleryBox}
                  onPress={() => handlePickMedia(type)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={type === 'video' ? 'videocam-outline' : 'images-outline'}
                    size={28}
                    color={COLORS.muted}
                  />
                  <Text style={styles.galleryTitle}>Choose from gallery</Text>
                  <Text style={styles.gallerySub}>
                    {type === 'video' ? 'Pick a video to save' : 'Pick a photo to save'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TextInput
                    style={[styles.input, type === 'note' && styles.inputNote]}
                    placeholder={type === 'note' ? 'Write a note…' : 'Paste a URL…'}
                    placeholderTextColor={COLORS.muted}
                    value={input}
                    onChangeText={setInput}
                    multiline={type === 'note'}
                    numberOfLines={type === 'note' ? 4 : 1}
                    autoCapitalize="none"
                    autoCorrect={type === 'note'}
                    keyboardType={type !== 'note' ? 'url' : 'default'}
                    textAlignVertical={type === 'note' ? 'top' : 'center'}
                  />

                  {type === 'link' ? (
                    <TouchableOpacity
                      style={[styles.primaryBtn, !input.trim() && styles.btnDisabled]}
                      onPress={handleFetchAndSuggest}
                      disabled={!input.trim()}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.primaryBtnText}>Fetch & Suggest  →</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.primaryBtn, !input.trim() && styles.btnDisabled]}
                      onPress={type === 'note' ? handleNotePreview : handleDirectSave}
                      disabled={!input.trim()}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.primaryBtnText}>
                        {type === 'note' ? 'Preview & Title  →' : `Save to ${UNSORTED_LABEL}`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </>
          )}

          {/* ── LOADING STEP ── */}
          {step === 'loading' && (
            <View style={styles.loadingWrap}>
              <View style={styles.loadingOrb}>
                <Ionicons name="sparkles" size={20} color="#fff" />
              </View>
              <Text style={styles.loadingTitle}>Analyzing</Text>
              <Text style={styles.loadingStatus}>{loadingStatus}</Text>
              <ActivityIndicator color={COLORS.accent} style={{ marginTop: SPACING.md }} />
            </View>
          )}

          {/* ── PREVIEW STEP ── */}
          {step === 'preview' && draft && (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {draft.imageUrl ? (
                <Image source={{ uri: draft.imageUrl }} style={styles.previewImage} resizeMode="cover" />
              ) : null}

              {domain ? (
                <View style={styles.domainPill}>
                  <Text style={styles.domainText}>{domain}</Text>
                </View>
              ) : null}

              {/* Editable title + AI suggest button (notes only) */}
              <View style={styles.titleRow}>
                <TextInput
                  style={[styles.previewTitle, styles.previewTitleFlex]}
                  value={draft.title}
                  onChangeText={v => setDraft(d => d ? { ...d, title: v } : d)}
                  multiline
                  numberOfLines={2}
                  placeholder="Add a title…"
                  placeholderTextColor={COLORS.muted}
                />
                {draft.type === 'note' && aiTitleDescriptionOn && (
                  <TouchableOpacity
                    onPress={handleResuggestTitle}
                    style={styles.suggestTitleBtn}
                    activeOpacity={0.7}
                    disabled={suggestingTitle}
                  >
                    {suggestingTitle
                      ? <ActivityIndicator size="small" color={COLORS.accent} />
                      : <Ionicons name="sparkles" size={16} color={COLORS.accent} />
                    }
                  </TouchableOpacity>
                )}
              </View>

              {draft.description ? (
                <Text style={styles.previewDesc} numberOfLines={2}>{draft.description}</Text>
              ) : null}

              {/* Collection picker */}
              <Text style={styles.sectionLabel}>Save to</Text>
              <View style={styles.collGrid}>
                {collOptions.map(opt => {
                  const on = selectedCollection === opt.id
                  return (
                    <TouchableOpacity
                      key={opt.id || 'inbox'}
                      style={[styles.collChip, on && styles.collChipOn]}
                      onPress={() => setSelectedCollection(opt.id)}
                      activeOpacity={0.75}
                    >
                      {opt.id === '' ? (
                        <Ionicons name="file-tray-outline" size={14} color={on ? '#fff' : COLORS.textSub} />
                      ) : opt.icon ? (
                        <Ionicons name={opt.icon} size={14} color={on ? '#fff' : (opt.color ?? COLORS.textSub)} />
                      ) : null}
                      {opt.recommended && <Ionicons name="sparkles" size={12} color={on ? '#fff' : COLORS.accent} />}
                      <Text style={[styles.collChipText, on && styles.collChipTextOn]}>{opt.label}</Text>
                    </TouchableOpacity>
                  )
                })}

                {showNewColl ? (
                  <TextInput
                    style={styles.collNewInput}
                    value={newColl}
                    onChangeText={setNewColl}
                    placeholder="New collection…"
                    placeholderTextColor={COLORS.muted}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={commitNewColl}
                    onBlur={commitNewColl}
                  />
                ) : (
                  <TouchableOpacity style={styles.collChipNew} onPress={() => setShowNewColl(true)} activeOpacity={0.7}>
                    <Text style={styles.collChipNewText}>+ New</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Tags */}
              <Text style={styles.sectionLabel}>Tags</Text>
              <View style={styles.tagsRow}>
                {draft.tags.map((tag, i) => (
                  <TouchableOpacity key={`${tag}-${i}`} style={styles.tagChip} onPress={() => removeTag(tag)} activeOpacity={0.7}>
                    <Text style={styles.tagChipText}>{tag}  ×</Text>
                  </TouchableOpacity>
                ))}
                {draft.tags.length < 5 && !showTagInput && (
                  <TouchableOpacity style={styles.tagAddBtn} onPress={() => setShowTagInput(true)} activeOpacity={0.7}>
                    <Text style={styles.tagAddText}>+ add</Text>
                  </TouchableOpacity>
                )}
                {showTagInput && (
                  <TextInput
                    style={styles.tagInput}
                    value={editingTag}
                    onChangeText={setEditingTag}
                    placeholder="new tag"
                    placeholderTextColor={COLORS.muted}
                    autoFocus
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={addTag}
                    onBlur={addTag}
                  />
                )}
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveDraft} activeOpacity={0.85}>
                <Text style={styles.primaryBtnText}>
                  {selectedCollection ? `Save to ${selectedCollection}` : `Save to ${UNSORTED_LABEL}`}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  kvWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
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
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 20,
    fontFamily: FONTS.serif,
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  typeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  typePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  typePillActive: {
    borderColor: COLORS.accent,
    backgroundColor: '#fdf0eb',
  },
  typePillText: {
    fontSize: 12,
    fontFamily: FONTS.sansMed,
    color: COLORS.textSub,
  },
  typePillTextActive: {
    color: COLORS.accent,
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: 15,
    fontFamily: FONTS.sans,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  inputNote: {
    minHeight: 100,
    paddingTop: SPACING.md,
  },
  galleryBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xl,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    backgroundColor: COLORS.card,
    marginBottom: SPACING.md,
  },
  galleryTitle: {
    fontSize: 15,
    fontFamily: FONTS.sansSemi,
    color: COLORS.text,
    marginTop: SPACING.xs,
  },
  gallerySub: {
    fontSize: 12.5,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
  },
  errorText: {
    fontSize: 12,
    fontFamily: FONTS.sans,
    color: '#e53e3e',
    marginBottom: SPACING.sm,
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    fontSize: 15,
    fontFamily: FONTS.sansSemi,
    color: '#fff',
    letterSpacing: 0.2,
  },

  // Loading
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: SPACING.xl * 2,
  },
  loadingOrb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  loadingTitle: {
    fontSize: 18,
    fontFamily: FONTS.serif,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  loadingStatus: {
    fontSize: 13,
    fontFamily: FONTS.sans,
    color: COLORS.textSub,
  },

  // Preview
  previewImage: {
    width: '100%',
    height: 160,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
  },
  domainPill: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    marginBottom: SPACING.sm,
  },
  domainText: {
    fontSize: 11,
    fontFamily: FONTS.sansMed,
    color: COLORS.textSub,
    letterSpacing: 0.3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  previewTitle: {
    fontSize: 18,
    fontFamily: FONTS.serif,
    color: COLORS.text,
    lineHeight: 24,
    paddingVertical: 0,
  },
  previewTitleFlex: {
    flex: 1,
  },
  suggestTitleBtn: {
    marginTop: 3,
    padding: 4,
  },
  previewDesc: {
    fontSize: 13,
    fontFamily: FONTS.sans,
    color: COLORS.textSub,
    lineHeight: 18,
    marginBottom: SPACING.md,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: FONTS.sansSemi,
    color: COLORS.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  collGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  collChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  collChipOn: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  collChipText: { fontSize: 13, fontFamily: FONTS.sansMed, color: COLORS.text },
  collChipTextOn: { color: '#fff' },
  collChipNew: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  collChipNewText: { fontSize: 13, fontFamily: FONTS.sansMed, color: COLORS.muted },
  collNewInput: {
    minWidth: 130,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 13,
    fontFamily: FONTS.sans,
    color: COLORS.text,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  tagChip: {
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  tagChipText: {
    fontSize: 12,
    fontFamily: FONTS.sansMed,
    color: COLORS.textSub,
  },
  tagAddBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  tagAddText: {
    fontSize: 12,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
  },
  tagInput: {
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.accent,
    fontSize: 12,
    fontFamily: FONTS.sans,
    color: COLORS.text,
    paddingVertical: 2,
    minWidth: 60,
  },
})

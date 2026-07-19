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
  Keyboard,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { ColorPalette, FONTS, SPACING, RADIUS } from '../constants/theme'
import { useColors, useThemedStyles } from '../contexts/ThemeContext'
import { UNSORTED_LABEL } from '../constants/labels'
import { DEFAULT_COLLECTION_ICON, IoniconName } from '../constants/icons'
import { SaveType, OGMetadata, AISuggestion, Collection } from '../types'
import { fetchOGMetadata, suggestForSave, suggestNoteTitle } from '../lib/ai'
import { fetchCollections, findSaveByUrl } from '../lib/db'
import { prepareMediaForUpload, uploadMedia } from '../lib/storage'
import { uploadImageBatch, MAX_BATCH_IMAGES } from '../lib/batchMediaUpload'
import { getSettings } from '../lib/settings'
import { generateVideoThumbnailUri } from '../lib/videoThumb'
import { extractTextFromImage } from '../lib/ocr'
import { syncDigestNotification } from '../lib/digestNotifications'
import { quickSaveBottomPadding } from '../lib/quickSaveLayout'
import * as FileSystem from 'expo-file-system/legacy'

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
  onSave?: (draft: Draft) => void | Promise<void>
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
  const colors = useColors()
  const styles = useThemedStyles(createStyles)
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
  const [saving, setSaving] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const show = Keyboard.addListener('keyboardDidShow', event => {
      setKeyboardHeight(event.endCoordinates.height)
    })
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

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
        setSaving(false)
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

    const pickerOptions: ImagePicker.ImagePickerOptions = {
      mediaTypes: kind === 'video' ? ['videos'] : ['images'],
      quality: 0.8,
      base64: true,
    }
    if (kind === 'image') {
      pickerOptions.allowsMultipleSelection = true
      pickerOptions.selectionLimit = MAX_BATCH_IMAGES
    }

    const result = await ImagePicker.launchImageLibraryAsync(pickerOptions)
    if (result.canceled || !result.assets?.length) return

    if (kind === 'image' && result.assets.length > 1) {
      setStep('loading')
      const { uploaded, failures } = await uploadImageBatch(result.assets, (done, total) => {
        setLoadingStatus(`Uploading ${done} of ${total}…`)
      })

      for (const item of uploaded) {
        const baseName = item.fileName?.replace(/\.[^.]+$/, '') || 'Photo'
        await onSave?.({
          url: '',
          type: 'image',
          title: baseName,
          description: '',
          imageUrl: item.publicUrl,
          collection: '',
          tags: [],
        })
      }

      if (uploaded.length > 0 && failures.length === 0) {
        onClose()
        return
      }

      if (uploaded.length > 0 && failures.length > 0) {
        setError(`${failures.length} photo(s) skipped. ${failures[0].message}`)
        onClose()
        return
      }

      setError(failures[0]?.message ?? 'Could not upload the selected photos.')
      setStep('input')
      return
    }

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

    let imageUrl: string | undefined = kind === 'image' ? publicUrl : undefined
    let ocrSource = kind === 'image' ? asset.uri : ''

    if (kind === 'video') {
      setLoadingStatus('Creating thumbnail…')
      const localThumb = await generateVideoThumbnailUri(asset.uri)
      if (localThumb) {
        ocrSource = localThumb
        try {
          const base64 = await FileSystem.readAsStringAsync(localThumb, { encoding: 'base64' })
          imageUrl = (await uploadMedia(base64, 'jpg', 'image/jpeg')) ?? localThumb
        } catch {
          imageUrl = localThumb
        }
      }
    }

    let ocrText = ''
    if (ocrSource) {
      setLoadingStatus('Reading text…')
      ocrText = await extractTextFromImage(ocrSource)
    }

    let title = asset.fileName ?? (kind === 'video' ? 'Video' : 'Photo')
    let description = ocrText.slice(0, 280)
    let collection = 'Read Later'
    let tags: string[] = []

    const settings = await getSettings()
    const wantSuggest =
      !!(ocrText && (settings.aiSuggestTags || settings.aiSuggestCollections || settings.aiSuggestTitleDescription))

    if (wantSuggest) {
      setLoadingStatus('Asking AI for suggestions…')
      try {
        if (settings.aiSuggestTitleDescription) {
          const suggested = await suggestNoteTitle(ocrText)
          if (suggested) title = suggested
        }
        if (settings.aiSuggestTags || settings.aiSuggestCollections) {
          const suggestion = await suggestForSave(
            { url: publicUrl, title, description: ocrText },
            collections,
          )
          collection = suggestion.collection
          tags = suggestion.tags
        }
      } catch {
        // keep filename defaults
      }
    }

    setDraft({
      url: kind === 'video' ? publicUrl : '',
      type: kind,
      title,
      description,
      imageUrl,
      collection,
      tags,
    })

    const suggested = collection?.trim()
    if (autoOrganizeRef.current && suggested && suggested.toLowerCase() !== 'read later') {
      setSelectedCollection(suggested)
    }

    setStep('preview')
  }

  const handleDirectSave = async () => {
    if (!input.trim() || saving) return
    const d: Draft = {
      url: input.trim(),
      type,
      title: input.trim(),
      description: '',
      collection: '',
      tags: [],
    }
    setSaving(true)
    try {
      await onSave?.(d)
      onClose()
    } catch {
      setError('Could not save. Please try again.')
      setSaving(false)
    }
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

  const handleSaveDraft = async () => {
    if (!draft || saving) return
    setSaving(true)
    setError('')
    try {
      // Carry the manually chosen collection name ('' = stays in Inbox).
      await onSave?.({ ...draft, collection: selectedCollection })
      void syncDigestNotification()
      onClose()
    } catch {
      setError('Could not save. Please try again.')
      setSaving(false)
    }
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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kvWrap}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: quickSaveBottomPadding(Platform.OS, keyboardHeight, insets.bottom) + SPACING.lg,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.handle} />

          {/* ── INPUT STEP ── */}
          {step === 'input' && (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.inputScroll}
            >
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
                      color={type === opt.key ? colors.accent : colors.textSub}
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
                    color={colors.muted}
                  />
                  <Text style={styles.galleryTitle}>Choose from gallery</Text>
                  <Text style={styles.gallerySub}>
                    {type === 'video' ? 'Pick a video to save' : 'Pick a photo to save'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <>
                  {type === 'note' ? (
                    <TextInput
                      key="note-input"
                      style={[styles.input, styles.inputNote]}
                      placeholder="Write a note…"
                      placeholderTextColor={colors.muted}
                      value={input}
                      onChangeText={setInput}
                      multiline
                      numberOfLines={4}
                      autoCapitalize="sentences"
                      autoCorrect
                      textAlignVertical="top"
                    />
                  ) : (
                    <TextInput
                      key="link-input"
                      style={styles.input}
                      placeholder="Paste a URL…"
                      placeholderTextColor={colors.muted}
                      value={input}
                      onChangeText={setInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      textAlignVertical="center"
                    />
                  )}

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
                      style={[styles.primaryBtn, (!input.trim() || saving) && styles.btnDisabled]}
                      onPress={type === 'note' ? handleNotePreview : handleDirectSave}
                      disabled={!input.trim() || saving}
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
            </ScrollView>
          )}

          {/* ── LOADING STEP ── */}
          {step === 'loading' && (
            <View style={styles.loadingWrap}>
              <View style={styles.loadingOrb}>
                <Ionicons name="sparkles" size={20} color="#fff" />
              </View>
              <Text style={styles.loadingTitle}>Analyzing</Text>
              <Text style={styles.loadingStatus}>{loadingStatus}</Text>
              <ActivityIndicator color={colors.accent} style={{ marginTop: SPACING.md }} />
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
                  placeholderTextColor={colors.muted}
                />
                {draft.type === 'note' && aiTitleDescriptionOn && (
                  <TouchableOpacity
                    onPress={handleResuggestTitle}
                    style={styles.suggestTitleBtn}
                    activeOpacity={0.7}
                    disabled={suggestingTitle}
                  >
                    {suggestingTitle
                      ? <ActivityIndicator size="small" color={colors.accent} />
                      : <Ionicons name="sparkles" size={16} color={colors.accent} />
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
                        <Ionicons name="file-tray-outline" size={14} color={on ? '#fff' : colors.textSub} />
                      ) : opt.icon ? (
                        <Ionicons name={opt.icon} size={14} color={on ? '#fff' : (opt.color ?? colors.textSub)} />
                      ) : null}
                      {opt.recommended && <Ionicons name="sparkles" size={12} color={on ? '#fff' : colors.accent} />}
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
                    placeholderTextColor={colors.muted}
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
                    placeholderTextColor={colors.muted}
                    autoFocus
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={addTag}
                    onBlur={addTag}
                  />
                )}
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, saving && styles.btnDisabled]}
                onPress={handleSaveDraft}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {selectedCollection ? `Save to ${selectedCollection}` : `Save to ${UNSORTED_LABEL}`}
                  </Text>
                )}
              </TouchableOpacity>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </ScrollView>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  kvWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  inputScroll: {
    paddingBottom: SPACING.sm,
  },
  sheet: {
    backgroundColor: c.cream,
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
    backgroundColor: c.border,
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 20,
    fontFamily: FONTS.serif,
    color: c.text,
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
    borderColor: c.border,
    backgroundColor: c.card,
  },
  typePillActive: {
    borderColor: c.accent,
    backgroundColor: c.accentSoft,
  },
  typePillText: {
    fontSize: 12,
    fontFamily: FONTS.sansMed,
    color: c.textSub,
  },
  typePillTextActive: {
    color: c.accent,
  },
  input: {
    backgroundColor: c.card,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: c.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: 15,
    fontFamily: FONTS.sans,
    color: c.text,
    marginBottom: SPACING.md,
  },
  inputNote: {
    minHeight: 100,
    maxHeight: SCREEN_HEIGHT * 0.4,
    paddingTop: SPACING.md,
  },
  galleryBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xl,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: c.border,
    borderStyle: 'dashed',
    backgroundColor: c.card,
    marginBottom: SPACING.md,
  },
  galleryTitle: {
    fontSize: 15,
    fontFamily: FONTS.sansSemi,
    color: c.text,
    marginTop: SPACING.xs,
  },
  gallerySub: {
    fontSize: 12.5,
    fontFamily: FONTS.sans,
    color: c.muted,
  },
  errorText: {
    fontSize: 12,
    fontFamily: FONTS.sans,
    color: '#e53e3e',
    marginBottom: SPACING.sm,
  },
  primaryBtn: {
    backgroundColor: c.accent,
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
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  loadingTitle: {
    fontSize: 18,
    fontFamily: FONTS.serif,
    color: c.text,
    marginBottom: SPACING.sm,
  },
  loadingStatus: {
    fontSize: 13,
    fontFamily: FONTS.sans,
    color: c.textSub,
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
    backgroundColor: c.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    marginBottom: SPACING.sm,
  },
  domainText: {
    fontSize: 11,
    fontFamily: FONTS.sansMed,
    color: c.textSub,
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
    color: c.text,
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
    color: c.textSub,
    lineHeight: 18,
    marginBottom: SPACING.md,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: FONTS.sansSemi,
    color: c.muted,
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
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  collChipOn: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  collChipText: { fontSize: 13, fontFamily: FONTS.sansMed, color: c.text },
  collChipTextOn: { color: '#fff' },
  collChipNew: {
    borderWidth: 1.5,
    borderColor: c.border,
    borderStyle: 'dashed',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  collChipNewText: { fontSize: 13, fontFamily: FONTS.sansMed, color: c.muted },
  collNewInput: {
    minWidth: 130,
    backgroundColor: c.card,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: c.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 13,
    fontFamily: FONTS.sans,
    color: c.text,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  tagChip: {
    backgroundColor: c.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  tagChipText: {
    fontSize: 12,
    fontFamily: FONTS.sansMed,
    color: c.textSub,
  },
  tagAddBtn: {
    borderWidth: 1.5,
    borderColor: c.border,
    borderStyle: 'dashed',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  tagAddText: {
    fontSize: 12,
    fontFamily: FONTS.sans,
    color: c.muted,
  },
  tagInput: {
    borderBottomWidth: 1.5,
    borderBottomColor: c.accent,
    fontSize: 12,
    fontFamily: FONTS.sans,
    color: c.text,
    paddingVertical: 2,
    minWidth: 60,
  },
  })
}

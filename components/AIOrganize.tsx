import { useEffect, useRef, useState } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Easing,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { ColorPalette, FONTS, SPACING, RADIUS } from '../constants/theme'
import { useColors, useThemedStyles } from '../contexts/ThemeContext'
import { UNSORTED_LABEL } from '../constants/labels'
import { Save, Collection, OrganizeSuggestion } from '../types'
import { organizeInboxItems } from '../lib/ai'
import {
  buildQueueFromSaves,
  cacheOrganizeSuggestions,
  clearOrganizeSession,
  getInflightOrganize,
  getOrganizeEdit,
  getOrganizeReviewIndex,
  missingOrganizeIds,
  organizeMissingKey,
  removeOrganizeSave,
  setOrganizeEdit,
  setOrganizeReviewIndex,
  trackInflightOrganize,
} from '../lib/organizeSession'

type Phase = 'loading' | 'review' | 'done'

interface AIOrganizeProps {
  visible: boolean
  onClose: () => void
  saves: Save[]
  collections: Collection[]
  onApply: (accepted: OrganizeSuggestion[]) => void | Promise<void>
}

export default function AIOrganize({ visible, onClose, saves, collections, onApply }: AIOrganizeProps) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useThemedStyles(createStyles)
  const [phase, setPhase] = useState<Phase>('loading')
  const [queue, setQueue] = useState<OrganizeSuggestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [editingItem, setEditingItem] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [customCollection, setCustomCollection] = useState(false)
  const [applying, setApplying] = useState(false)
  const [appliedCount, setAppliedCount] = useState(0)
  const [editTick, setEditTick] = useState(0)

  const batchIdsRef = useRef<string[]>([])
  const mountedRef = useRef(true)

  const scale = useRef(new Animated.Value(1)).current
  const glowOpacity = useRef(new Animated.Value(0.4)).current
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null)

  const backdropOpacity = useRef(new Animated.Value(0)).current
  const sheetY = useRef(new Animated.Value(400)).current
  const contentOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const startPulse = () => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.08, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        ]),
      ])
    )
    pulseLoop.current.start()
  }

  const stopPulse = () => {
    pulseLoop.current?.stop()
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()
  }

  const hydrateQueue = (saveIds: string[]) => {
    const items = buildQueueFromSaves(saveIds)
    setQueue(items)
    const idx = Math.min(getOrganizeReviewIndex(), Math.max(0, items.length - 1))
    setCurrentIndex(idx)
    setPhase(items.length === 0 ? 'done' : 'review')
  }

  const loadSuggestions = async (batch: Save[]) => {
    const saveIds = batch.map(s => s.id)
    batchIdsRef.current = saveIds

    const missing = missingOrganizeIds(saveIds)
    if (missing.length === 0) {
      stopPulse()
      hydrateQueue(saveIds)
      return
    }

    const missingKey = organizeMissingKey(missing)
    const missingSaves = batch.filter(s => missing.includes(s.id))

    let promise = getInflightOrganize(missingKey)
    if (!promise) {
      promise = organizeInboxItems(missingSaves, collections)
      trackInflightOrganize(missingKey, promise)
    }

    try {
      const result = await promise
      if (!mountedRef.current) return
      cacheOrganizeSuggestions(result)
      stopPulse()
      hydrateQueue(saveIds)
    } catch {
      if (!mountedRef.current) return
      const fallback = missingSaves.map(s => ({
        save: s,
        suggested_collection: 'Read Later',
        suggested_tags: [] as string[],
        confidence: 0,
      }))
      cacheOrganizeSuggestions(fallback)
      stopPulse()
      hydrateQueue(saveIds)
    }
  }

  useEffect(() => {
    if (visible) {
      setEditingItem(false)
      setCustomCollection(false)
      setNewTag('')
      setApplying(false)
      setAppliedCount(0)

      const saveIds = saves.map(s => s.id)
      batchIdsRef.current = saveIds
      const cached = buildQueueFromSaves(saveIds)
      const needsAi = missingOrganizeIds(saveIds).length > 0

      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(sheetY, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(contentOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      ]).start()

      if (!needsAi && cached.length > 0) {
        setPhase('review')
        setQueue(cached)
        setCurrentIndex(Math.min(getOrganizeReviewIndex(), Math.max(0, cached.length - 1)))
        return
      }

      setPhase('loading')
      setCurrentIndex(getOrganizeReviewIndex())
      startPulse()
      loadSuggestions(saves)
    } else {
      setOrganizeReviewIndex(currentIndex)
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(contentOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start()
      sheetY.setValue(400)
    }
  }, [visible])

  const currentSuggestion = queue[currentIndex]
  const saveId = currentSuggestion?.save.id
  void editTick
  const cachedEdit = saveId ? getOrganizeEdit(saveId) : undefined

  const effectiveCollection =
    cachedEdit?.collection ?? currentSuggestion?.suggested_collection ?? 'Read Later'
  const effectiveTags = cachedEdit?.tags ?? currentSuggestion?.suggested_tags ?? []

  const persistEdit = (collection: string, tags: string[]) => {
    if (!saveId) return
    setOrganizeEdit(saveId, { collection, tags })
    setEditTick(t => t + 1)
  }

  const updateCollection = (v: string) => persistEdit(v, effectiveTags)

  const pickCollection = (name: string) => {
    setCustomCollection(false)
    updateCollection(name)
  }

  const removeTag = (tag: string) => persistEdit(effectiveCollection, effectiveTags.filter(t => t !== tag))

  const addTag = () => {
    const t = newTag.trim().toLowerCase().replace(/\s+/g, '-')
    if (t && !effectiveTags.includes(t)) {
      persistEdit(effectiveCollection, [...effectiveTags, t])
    }
    setNewTag('')
  }

  const buildSuggestion = (s: OrganizeSuggestion): OrganizeSuggestion => {
    const edit = getOrganizeEdit(s.save.id)
    return {
      ...s,
      suggested_collection: edit?.collection ?? s.suggested_collection,
      suggested_tags: edit?.tags ?? s.suggested_tags,
    }
  }

  const finishIfEmpty = (nextQueue: OrganizeSuggestion[]) => {
    if (nextQueue.length === 0) {
      clearOrganizeSession()
      setPhase('done')
    }
  }

  const advance = () => {
    setEditingItem(false)
    setCustomCollection(false)
    if (currentIndex < queue.length - 1) {
      const next = currentIndex + 1
      setCurrentIndex(next)
      setOrganizeReviewIndex(next)
    } else {
      clearOrganizeSession()
      setPhase('done')
    }
  }

  const acceptCurrent = async () => {
    if (!currentSuggestion || applying) return
    const item = buildSuggestion(currentSuggestion)
    setApplying(true)
    try {
      await onApply([item])
      setAppliedCount(c => c + 1)
      removeOrganizeSave(item.save.id)
      const nextQueue = queue.filter(s => s.save.id !== item.save.id)
      setQueue(nextQueue)
      const nextIndex = Math.min(currentIndex, Math.max(0, nextQueue.length - 1))
      setCurrentIndex(nextIndex)
      setOrganizeReviewIndex(nextIndex)
      setEditingItem(false)
      setCustomCollection(false)
      finishIfEmpty(nextQueue)
    } finally {
      if (mountedRef.current) setApplying(false)
    }
  }

  const skipCurrent = () => advance()

  const acceptAllRemaining = async () => {
    if (applying || queue.length === 0) return
    const remaining = queue.slice(currentIndex).map(buildSuggestion)
    setApplying(true)
    try {
      await onApply(remaining)
      setAppliedCount(c => c + remaining.length)
      remaining.forEach(s => removeOrganizeSave(s.save.id))
      clearOrganizeSession()
      setQueue([])
      setPhase('done')
    } finally {
      if (mountedRef.current) setApplying(false)
    }
  }

  const handleClose = () => {
    setOrganizeReviewIndex(currentIndex)
    onClose()
  }

  const remaining = queue.length - currentIndex
  const collectionNames = [...new Set(collections.map(c => c.name))]

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} activeOpacity={1} />
      </Animated.View>

      <View style={[styles.container, { paddingBottom: insets.bottom }]} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, { opacity: contentOpacity, transform: [{ translateY: sheetY }] }]}>
          <View style={styles.handle} />

          {phase === 'loading' && (
            <View style={styles.loadingWrap}>
              <View style={styles.orbContainer}>
                <Animated.View style={[styles.orbGlow, { opacity: glowOpacity }]} />
                <Animated.View style={[styles.orb, { transform: [{ scale }] }]}>
                  <Ionicons name="sparkles" size={22} color="#fff" />
                </Animated.View>
              </View>
              <Text style={styles.loadingTitle}>Analyzing {UNSORTED_LABEL.toLowerCase()}</Text>
              <Text style={styles.loadingSubtitle}>Finding the right collections and tags…</Text>
              <ActivityIndicator color={colors.accent} style={{ marginTop: SPACING.md }} />
            </View>
          )}

          {phase === 'review' && currentSuggestion && (
            <>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewTitle}>Organize {UNSORTED_LABEL}</Text>
                <View style={styles.progressBadge}>
                  <Text style={styles.progressText}>{currentIndex + 1} of {queue.length}</Text>
                </View>
              </View>

              <View style={styles.itemCard}>
                <View style={styles.itemTypeRow}>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>{currentSuggestion.save.type.toUpperCase()}</Text>
                  </View>
                  {currentSuggestion.save.url ? (
                    <Text style={styles.itemDomain} numberOfLines={1}>
                      {(() => { try { return new URL(currentSuggestion.save.url).hostname.replace(/^www\./, '') } catch { return '' } })()}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.itemTitle} numberOfLines={2}>{currentSuggestion.save.title}</Text>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={styles.editArea} keyboardShouldPersistTaps="handled">
                <Text style={styles.sectionLabel}>Collection</Text>
                {editingItem ? (
                  <>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.collectionPicker}
                      contentContainerStyle={styles.collectionPickerRow}
                    >
                      {collectionNames.map(name => {
                        const active = effectiveCollection.toLowerCase() === name.toLowerCase() && !customCollection
                        return (
                          <TouchableOpacity
                            key={name}
                            style={[styles.collectionOption, active && styles.collectionOptionActive]}
                            onPress={() => pickCollection(name)}
                            activeOpacity={0.75}
                          >
                            <Text style={[styles.collectionOptionText, active && styles.collectionOptionTextActive]}>
                              {name}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                      <TouchableOpacity
                        style={[styles.collectionOption, customCollection && styles.collectionOptionActive]}
                        onPress={() => setCustomCollection(true)}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.collectionOptionText, customCollection && styles.collectionOptionTextActive]}>
                          + New
                        </Text>
                      </TouchableOpacity>
                    </ScrollView>
                    {(customCollection || collectionNames.length === 0) && (
                      <TextInput
                        style={styles.collectionInput}
                        value={effectiveCollection}
                        onChangeText={updateCollection}
                        autoCapitalize="words"
                        returnKeyType="done"
                        placeholder="Collection name"
                        placeholderTextColor={colors.muted}
                      />
                    )}
                  </>
                ) : (
                  <TouchableOpacity style={styles.collectionChip} onPress={() => setEditingItem(true)} activeOpacity={0.8}>
                    <View style={styles.collectionChipMain}>
                      <Ionicons name="sparkles" size={15} color={colors.accent} />
                      <Text style={styles.collectionChipText}>{effectiveCollection}</Text>
                    </View>
                    <Text style={styles.editHint}>tap to edit</Text>
                  </TouchableOpacity>
                )}

                <Text style={styles.sectionLabel}>Tags</Text>
                {effectiveTags.length === 0 && !editingItem ? (
                  <Text style={styles.tagsEmpty}>No tags suggested — tap Edit to add some.</Text>
                ) : null}
                <View style={styles.tagsRow}>
                  {effectiveTags.map((tag, i) => (
                    <TouchableOpacity
                      key={`${tag}-${i}`}
                      style={styles.tagChip}
                      onPress={() => editingItem && removeTag(tag)}
                      activeOpacity={editingItem ? 0.7 : 1}
                    >
                      <Text style={styles.tagText}>{tag}{editingItem ? '  ×' : ''}</Text>
                    </TouchableOpacity>
                  ))}
                  {editingItem && effectiveTags.length < 5 && (
                    <TextInput
                      style={styles.tagInput}
                      value={newTag}
                      onChangeText={setNewTag}
                      placeholder="+ tag"
                      placeholderTextColor={colors.muted}
                      autoCapitalize="none"
                      returnKeyType="done"
                      onSubmitEditing={addTag}
                      blurOnSubmit={false}
                    />
                  )}
                </View>
              </ScrollView>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.skipBtn}
                  onPress={skipCurrent}
                  disabled={applying}
                  activeOpacity={0.75}
                >
                  <Text style={styles.skipBtnText}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editBtn, editingItem && styles.editBtnActive]}
                  onPress={() => setEditingItem(e => !e)}
                  disabled={applying}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.editBtnText, editingItem && styles.editBtnTextActive]}>
                    {editingItem ? 'Done' : 'Edit'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.acceptBtn, applying && styles.acceptBtnDisabled]}
                  onPress={acceptCurrent}
                  disabled={applying}
                  activeOpacity={0.85}
                >
                  {applying ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.acceptBtnText}>Accept ✓</Text>
                  )}
                </TouchableOpacity>
              </View>

              {remaining > 1 && (
                <TouchableOpacity
                  style={styles.acceptAllBtn}
                  onPress={acceptAllRemaining}
                  disabled={applying}
                  activeOpacity={0.8}
                >
                  <Text style={styles.acceptAllText}>Accept All Remaining ({remaining}) →</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {phase === 'done' && (
            <View style={styles.doneWrap}>
              <View style={styles.doneCheck}>
                <Text style={styles.doneCheckIcon}>✓</Text>
              </View>
              <Text style={styles.doneTitle}>All organized!</Text>
              <Text style={styles.doneSub}>
                {appliedCount} {appliedCount === 1 ? 'item' : 'items'} sorted into collections.
              </Text>
              <TouchableOpacity style={styles.doneBtn} onPress={handleClose} activeOpacity={0.85}>
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  )
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: c.cream,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xl,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    marginBottom: SPACING.xl,
  },
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: SPACING.xl * 2,
  },
  orbContainer: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  orbGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: c.accent,
  },
  orb: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
  },
  loadingTitle: {
    fontSize: 20,
    fontFamily: FONTS.serif,
    color: c.text,
    marginBottom: SPACING.sm,
  },
  loadingSubtitle: {
    fontSize: 13,
    fontFamily: FONTS.sans,
    color: c.textSub,
    textAlign: 'center',
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  reviewTitle: {
    fontSize: 20,
    fontFamily: FONTS.serif,
    color: c.text,
  },
  progressBadge: {
    backgroundColor: c.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  progressText: {
    fontSize: 12,
    fontFamily: FONTS.sansMed,
    color: c.textSub,
  },
  itemCard: {
    backgroundColor: c.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  itemTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  typeBadge: {
    backgroundColor: c.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  typeBadgeText: {
    fontSize: 9,
    fontFamily: FONTS.sansBold,
    color: c.muted,
    letterSpacing: 0.8,
  },
  itemDomain: {
    fontSize: 11,
    fontFamily: FONTS.sans,
    color: c.muted,
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontFamily: FONTS.serif,
    color: c.text,
    lineHeight: 21,
  },
  editArea: {
    maxHeight: 200,
    marginBottom: SPACING.md,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: FONTS.sansSemi,
    color: c.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  collectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.accentSoft,
    borderWidth: 1,
    borderColor: c.accentBorder,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  collectionChipMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  collectionChipText: {
    fontSize: 14,
    fontFamily: FONTS.sansMed,
    color: c.accent,
  },
  editHint: {
    fontSize: 10,
    fontFamily: FONTS.sans,
    color: c.muted,
  },
  collectionInput: {
    backgroundColor: c.card,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: c.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 14,
    fontFamily: FONTS.sans,
    color: c.text,
    marginBottom: SPACING.sm,
  },
  collectionPicker: { marginBottom: SPACING.sm, maxHeight: 40 },
  collectionPickerRow: { gap: SPACING.sm, paddingRight: SPACING.sm },
  collectionOption: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
  },
  collectionOptionActive: {
    borderColor: c.accent,
    backgroundColor: c.accentSoft,
  },
  collectionOptionText: {
    fontSize: 13,
    fontFamily: FONTS.sansMed,
    color: c.textSub,
  },
  collectionOptionTextActive: {
    color: c.accent,
  },
  tagsEmpty: {
    fontSize: 12,
    fontFamily: FONTS.sans,
    color: c.muted,
    marginBottom: SPACING.sm,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  tagChip: {
    backgroundColor: c.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 12,
    fontFamily: FONTS.sansMed,
    color: c.textSub,
  },
  tagInput: {
    borderBottomWidth: 1.5,
    borderBottomColor: c.accent,
    fontSize: 12,
    fontFamily: FONTS.sans,
    color: c.text,
    paddingVertical: 2,
    minWidth: 56,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  skipBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: c.border,
  },
  skipBtnText: {
    fontSize: 14,
    fontFamily: FONTS.sansMed,
    color: c.muted,
  },
  editBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: c.border,
  },
  editBtnActive: {
    borderColor: c.accent,
    backgroundColor: c.accentSoft,
  },
  editBtnText: {
    fontSize: 14,
    fontFamily: FONTS.sansMed,
    color: c.textSub,
  },
  editBtnTextActive: {
    color: c.accent,
  },
  acceptBtn: {
    flex: 1.5,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: c.accent,
  },
  acceptBtnDisabled: {
    opacity: 0.7,
  },
  acceptBtnText: {
    fontSize: 14,
    fontFamily: FONTS.sansSemi,
    color: '#fff',
  },
  acceptAllBtn: {
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  acceptAllText: {
    fontSize: 13,
    fontFamily: FONTS.sansMed,
    color: c.accent,
    letterSpacing: 0.2,
  },
  doneWrap: {
    alignItems: 'center',
    paddingVertical: SPACING.xl * 2,
    gap: SPACING.md,
  },
  doneCheck: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  doneCheckIcon: {
    fontSize: 24,
    color: '#fff',
    fontFamily: FONTS.sansBold,
  },
  doneTitle: {
    fontSize: 22,
    fontFamily: FONTS.serif,
    color: c.text,
  },
  doneSub: {
    fontSize: 14,
    fontFamily: FONTS.sans,
    color: c.textSub,
    textAlign: 'center',
  },
  doneBtn: {
    backgroundColor: c.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl * 2,
    marginTop: SPACING.md,
  },
  doneBtnText: {
    fontSize: 15,
    fontFamily: FONTS.sansSemi,
    color: '#fff',
  },
  })
}

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
import { COLORS, FONTS, SPACING, RADIUS } from '../constants/theme'
import { Save, Collection, OrganizeSuggestion } from '../types'
import { organizeInboxItems } from '../lib/ai'

type Phase = 'loading' | 'review' | 'done'
type Decision = 'accept' | 'skip'

interface EditState {
  collection: string
  tags: string[]
}

interface AIOrganizeProps {
  visible: boolean
  onClose: () => void
  saves: Save[]
  collections: Collection[]
  onApply: (accepted: OrganizeSuggestion[]) => void
}

export default function AIOrganize({ visible, onClose, saves, collections, onApply }: AIOrganizeProps) {
  const insets = useSafeAreaInsets()
  const [phase, setPhase] = useState<Phase>('loading')
  const [suggestions, setSuggestions] = useState<OrganizeSuggestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [decisions, setDecisions] = useState<(Decision | null)[]>([])
  const [edits, setEdits] = useState<Record<number, EditState>>({})
  const [editingItem, setEditingItem] = useState(false)
  const [newTag, setNewTag] = useState('')

  const scale = useRef(new Animated.Value(1)).current
  const glowOpacity = useRef(new Animated.Value(0.4)).current
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null)

  const backdropOpacity = useRef(new Animated.Value(0)).current
  const sheetY = useRef(new Animated.Value(400)).current
  const contentOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      setPhase('loading')
      setCurrentIndex(0)
      setDecisions([])
      setEdits({})
      setEditingItem(false)

      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(sheetY, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(contentOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      ]).start()

      startPulse()

      organizeInboxItems(saves, collections)
        .then(result => {
          setSuggestions(result)
          setDecisions(new Array(result.length).fill(null))
          stopPulse()
          setPhase('review')
        })
        .catch(() => {
          // Fallback: use defaults
          const fallback = saves.map(s => ({
            save: s,
            suggested_collection: 'Read Later',
            suggested_tags: [],
            confidence: 0,
          }))
          setSuggestions(fallback)
          setDecisions(new Array(fallback.length).fill(null))
          stopPulse()
          setPhase('review')
        })
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(contentOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start()
      sheetY.setValue(400)
    }
  }, [visible])

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

  const currentSuggestion = suggestions[currentIndex]
  const currentEdit = edits[currentIndex]

  const effectiveCollection = currentEdit?.collection ?? currentSuggestion?.suggested_collection ?? 'Read Later'
  const effectiveTags = currentEdit?.tags ?? currentSuggestion?.suggested_tags ?? []

  const updateCollection = (v: string) =>
    setEdits(e => ({ ...e, [currentIndex]: { collection: v, tags: effectiveTags } }))

  const removeTag = (tag: string) =>
    setEdits(e => ({ ...e, [currentIndex]: { collection: effectiveCollection, tags: effectiveTags.filter(t => t !== tag) } }))

  const addTag = () => {
    const t = newTag.trim().toLowerCase().replace(/\s+/g, '-')
    if (t && !effectiveTags.includes(t)) {
      setEdits(e => ({ ...e, [currentIndex]: { collection: effectiveCollection, tags: [...effectiveTags, t] } }))
    }
    setNewTag('')
  }

  const decide = (decision: Decision) => {
    setDecisions(prev => {
      const next = [...prev]
      next[currentIndex] = decision
      return next
    })
    setEditingItem(false)
    if (currentIndex < suggestions.length - 1) {
      setCurrentIndex(i => i + 1)
    } else {
      applyAndFinish([...decisions.slice(0, currentIndex), decision])
    }
  }

  const acceptAll = () => {
    const allAccept = decisions.map((d, i) => (i < currentIndex ? d : 'accept') as Decision)
    applyAndFinish(allAccept)
  }

  const applyAndFinish = (finalDecisions: (Decision | null)[]) => {
    const accepted: OrganizeSuggestion[] = suggestions
      .map((s, i) => {
        if (finalDecisions[i] === 'skip') return null
        const edit = edits[i]
        return {
          ...s,
          suggested_collection: edit?.collection ?? s.suggested_collection,
          suggested_tags: edit?.tags ?? s.suggested_tags,
        }
      })
      .filter(Boolean) as OrganizeSuggestion[]

    onApply(accepted)
    setPhase('done')
  }

  const remaining = suggestions.length - currentIndex
  const accepted = decisions.filter(d => d === 'accept').length

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      <View style={[styles.container, { paddingBottom: insets.bottom }]} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, { opacity: contentOpacity, transform: [{ translateY: sheetY }] }]}>
          <View style={styles.handle} />

          {/* ── LOADING ── */}
          {phase === 'loading' && (
            <View style={styles.loadingWrap}>
              <View style={styles.orbContainer}>
                <Animated.View style={[styles.orbGlow, { opacity: glowOpacity }]} />
                <Animated.View style={[styles.orb, { transform: [{ scale }] }]}>
                  <Ionicons name="sparkles" size={22} color="#fff" />
                </Animated.View>
              </View>
              <Text style={styles.loadingTitle}>Analyzing your inbox</Text>
              <Text style={styles.loadingSubtitle}>Finding the right collections and tags…</Text>
              <ActivityIndicator color={COLORS.accent} style={{ marginTop: SPACING.md }} />
            </View>
          )}

          {/* ── REVIEW ── */}
          {phase === 'review' && currentSuggestion && (
            <>
              {/* Header */}
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewTitle}>Organize Inbox</Text>
                <View style={styles.progressBadge}>
                  <Text style={styles.progressText}>{currentIndex + 1} of {suggestions.length}</Text>
                </View>
              </View>

              {/* Item card */}
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

              {/* Suggestion / edit area */}
              <ScrollView showsVerticalScrollIndicator={false} style={styles.editArea} keyboardShouldPersistTaps="handled">
                <Text style={styles.sectionLabel}>Collection</Text>
                {editingItem ? (
                  <TextInput
                    style={styles.collectionInput}
                    value={effectiveCollection}
                    onChangeText={updateCollection}
                    autoCapitalize="words"
                    returnKeyType="done"
                    onSubmitEditing={() => {}}
                  />
                ) : (
                  <TouchableOpacity style={styles.collectionChip} onPress={() => setEditingItem(true)} activeOpacity={0.8}>
                    <View style={styles.collectionChipMain}>
                      <Ionicons name="sparkles" size={15} color={COLORS.accent} />
                      <Text style={styles.collectionChipText}>{effectiveCollection}</Text>
                    </View>
                    <Text style={styles.editHint}>tap to edit</Text>
                  </TouchableOpacity>
                )}

                <Text style={styles.sectionLabel}>Tags</Text>
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
                      placeholderTextColor={COLORS.muted}
                      autoCapitalize="none"
                      returnKeyType="done"
                      onSubmitEditing={addTag}
                      blurOnSubmit={false}
                    />
                  )}
                </View>
              </ScrollView>

              {/* Action buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.skipBtn} onPress={() => decide('skip')} activeOpacity={0.75}>
                  <Text style={styles.skipBtnText}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editBtn, editingItem && styles.editBtnActive]}
                  onPress={() => setEditingItem(e => !e)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.editBtnText, editingItem && styles.editBtnTextActive]}>
                    {editingItem ? 'Done' : 'Edit'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.acceptBtn} onPress={() => decide('accept')} activeOpacity={0.85}>
                  <Text style={styles.acceptBtnText}>Accept ✓</Text>
                </TouchableOpacity>
              </View>

              {remaining > 1 && (
                <TouchableOpacity style={styles.acceptAllBtn} onPress={acceptAll} activeOpacity={0.8}>
                  <Text style={styles.acceptAllText}>Accept All Remaining ({remaining}) →</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* ── DONE ── */}
          {phase === 'done' && (
            <View style={styles.doneWrap}>
              <View style={styles.doneCheck}>
                <Text style={styles.doneCheckIcon}>✓</Text>
              </View>
              <Text style={styles.doneTitle}>All organized!</Text>
              <Text style={styles.doneSub}>{accepted} {accepted === 1 ? 'item' : 'items'} sorted into collections.</Text>
              <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.cream,
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
    backgroundColor: COLORS.border,
    marginBottom: SPACING.xl,
  },

  // Loading
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
    backgroundColor: COLORS.accent,
  },
  orb: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
  },
  loadingTitle: {
    fontSize: 20,
    fontFamily: FONTS.serif,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  loadingSubtitle: {
    fontSize: 13,
    fontFamily: FONTS.sans,
    color: COLORS.textSub,
    textAlign: 'center',
  },

  // Review
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  reviewTitle: {
    fontSize: 20,
    fontFamily: FONTS.serif,
    color: COLORS.text,
  },
  progressBadge: {
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  progressText: {
    fontSize: 12,
    fontFamily: FONTS.sansMed,
    color: COLORS.textSub,
  },
  itemCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  typeBadgeText: {
    fontSize: 9,
    fontFamily: FONTS.sansBold,
    color: COLORS.muted,
    letterSpacing: 0.8,
  },
  itemDomain: {
    fontSize: 11,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontFamily: FONTS.serif,
    color: COLORS.text,
    lineHeight: 21,
  },
  editArea: {
    maxHeight: 200,
    marginBottom: SPACING.md,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: FONTS.sansSemi,
    color: COLORS.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  collectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fdf0eb',
    borderWidth: 1,
    borderColor: '#f0c4b4',
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
    color: COLORS.accent,
  },
  editHint: {
    fontSize: 10,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
  },
  collectionInput: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 14,
    fontFamily: FONTS.sans,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  tagChip: {
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 12,
    fontFamily: FONTS.sansMed,
    color: COLORS.textSub,
  },
  tagInput: {
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.accent,
    fontSize: 12,
    fontFamily: FONTS.sans,
    color: COLORS.text,
    paddingVertical: 2,
    minWidth: 56,
  },

  // Action row
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
    borderColor: COLORS.border,
  },
  skipBtnText: {
    fontSize: 14,
    fontFamily: FONTS.sansMed,
    color: COLORS.muted,
  },
  editBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  editBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: '#fdf0eb',
  },
  editBtnText: {
    fontSize: 14,
    fontFamily: FONTS.sansMed,
    color: COLORS.textSub,
  },
  editBtnTextActive: {
    color: COLORS.accent,
  },
  acceptBtn: {
    flex: 1.5,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
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
    color: COLORS.accent,
    letterSpacing: 0.2,
  },

  // Done
  doneWrap: {
    alignItems: 'center',
    paddingVertical: SPACING.xl * 2,
    gap: SPACING.md,
  },
  doneCheck: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accent,
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
    color: COLORS.text,
  },
  doneSub: {
    fontSize: 14,
    fontFamily: FONTS.sans,
    color: COLORS.textSub,
    textAlign: 'center',
  },
  doneBtn: {
    backgroundColor: COLORS.accent,
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

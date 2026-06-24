import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { Save, SaveType } from '../../types'
import SaveCard from '../../components/SaveCard'
import { searchSaves, fetchSearchSuggestions } from '../../lib/db'
import { getRecentSearches, addRecentSearch } from '../../lib/recents'

// Shown only until the user's own data produces suggestions.
const SAMPLE_SUGGESTIONS = [
  'that miso recipe I saved',
  'design articles from last month',
  'kitchen lighting ideas',
]

type TypeId = 'all' | SaveType
const TYPES: { id: TypeId; label: string; icon?: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'all', label: 'All' },
  { id: 'link', label: 'Links', icon: 'link-outline' },
  { id: 'image', label: 'Images', icon: 'image-outline' },
  { id: 'video', label: 'Videos', icon: 'videocam-outline' },
  { id: 'note', label: 'Notes', icon: 'document-text-outline' },
]

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [type, setType] = useState<TypeId>('all')
  const [results, setResults] = useState<Save[]>([])
  const [searching, setSearching] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [recents, setRecents] = useState<string[]>([])
  const debouncedQuery = useDebounce(query, 350)

  useEffect(() => {
    fetchSearchSuggestions().then(s => setSuggestions(s.length ? s : SAMPLE_SUGGESTIONS))
    getRecentSearches().then(setRecents)
  }, [])

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    searchSaves(debouncedQuery).then(data => {
      setResults(data)
      setSearching(false)
    })
  }, [debouncedQuery])

  // Set the query and remember it as a recent search.
  const runSearch = (term: string) => {
    setQuery(term)
    addRecentSearch(term).then(setRecents)
  }

  const ql = debouncedQuery.trim().toLowerCase()
  const hasQuery = ql.length > 0
  const isQuestion = ql.length > 14 || /\b(that|where|find|my|i saved)\b/.test(ql)

  const shown = type === 'all' ? results : results.filter(r => r.type === type)
  const leftCol = shown.filter((_, i) => i % 2 === 0)
  const rightCol = shown.filter((_, i) => i % 2 === 1)

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>Search</Text>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={COLORS.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search or ask in plain words…"
            placeholderTextColor={COLORS.muted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => query.trim() && runSearch(query)}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {!hasQuery && (
          <>
            <View style={styles.tryHeader}>
              <Ionicons name="sparkles" size={16} color={COLORS.accent} />
              <Text style={styles.tryHeaderText}>Try asking</Text>
            </View>
            <View style={styles.suggestList}>
              {suggestions.map(s => (
                <TouchableOpacity key={s} style={styles.suggestRow} onPress={() => runSearch(s)} activeOpacity={0.8}>
                  <Text style={styles.suggestText}>"{s}"</Text>
                  <Ionicons name="arrow-forward" size={16} color={COLORS.muted} />
                </TouchableOpacity>
              ))}
            </View>

            {recents.length > 0 && (
              <>
                <Text style={styles.recentLabel}>RECENT</Text>
                <View style={styles.recentRow}>
                  {recents.map(r => (
                    <TouchableOpacity key={r} style={styles.recentChip} onPress={() => runSearch(r)} activeOpacity={0.8}>
                      <Ionicons name="time-outline" size={14} color={COLORS.muted} />
                      <Text style={styles.recentChipText}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {hasQuery && (
          <>
            {isQuestion && !searching && (
              <View style={styles.aiAnswer}>
                <View style={styles.aiAnswerHead}>
                  <Ionicons name="sparkles" size={16} color={COLORS.accent} />
                  <Text style={styles.aiAnswerLabel}>AI answer</Text>
                </View>
                <Text style={styles.aiAnswerText}>
                  Found {shown.length} {shown.length === 1 ? 'save' : 'saves'} that match.
                  {shown[0] ? ` The closest is ${shown[0].title}.` : ''}
                </Text>
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow} style={styles.typeScroll}>
              {TYPES.map(t => {
                const on = type === t.id
                return (
                  <TouchableOpacity key={t.id} style={[styles.typeChip, on && styles.typeChipOn]} onPress={() => setType(t.id)} activeOpacity={0.8}>
                    {t.icon && <Ionicons name={t.icon} size={14} color={on ? '#fff' : COLORS.text} />}
                    <Text style={[styles.typeChipText, on && styles.typeChipTextOn]}>{t.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>

            {searching ? (
              <ActivityIndicator color={COLORS.accent} style={{ marginTop: SPACING.xl * 2 }} />
            ) : shown.length === 0 ? (
              <View style={styles.noResults}>
                <Text style={styles.noResultsIcon}>◎</Text>
                <Text style={styles.noResultsTitle}>Nothing found</Text>
                <Text style={styles.noResultsSub}>No saves match "{debouncedQuery}" yet.</Text>
              </View>
            ) : (
              <View style={styles.grid}>
                <View style={styles.col}>
                  {leftCol.map(save => (
                    <SaveCard key={save.id} save={save} onPress={() => router.push(`/save/${save.id}`)} />
                  ))}
                </View>
                <View style={styles.col}>
                  {rightCol.map(save => (
                    <SaveCard key={save.id} save={save} onPress={() => router.push(`/save/${save.id}`)} />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerWrap: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.md, gap: SPACING.md },
  title: { fontSize: 38, fontFamily: FONTS.serif, color: COLORS.text, letterSpacing: -0.5 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, height: 48,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: FONTS.sans, color: COLORS.text, paddingVertical: 0 },
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.xl * 2 },

  tryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md },
  tryHeaderText: { fontSize: 13, fontFamily: FONTS.sansBold, color: COLORS.accent },
  suggestList: { gap: SPACING.sm },
  suggestRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  suggestText: { flex: 1, fontSize: 14, fontFamily: FONTS.sans, color: COLORS.text },

  recentLabel: { fontSize: 11, fontFamily: FONTS.mono, color: COLORS.muted, letterSpacing: 1, marginTop: SPACING.xl, marginBottom: SPACING.md },
  recentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  recentChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  recentChipText: { fontSize: 13, fontFamily: FONTS.sansSemi, color: COLORS.text },

  aiAnswer: {
    padding: SPACING.md, borderRadius: RADIUS.lg, marginBottom: SPACING.md,
    backgroundColor: COLORS.accentSoft, borderWidth: 1, borderColor: COLORS.accentBorder,
  },
  aiAnswerHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  aiAnswerLabel: { fontSize: 12.5, fontFamily: FONTS.sansBold, color: COLORS.accent },
  aiAnswerText: { fontSize: 13.5, fontFamily: FONTS.sans, color: COLORS.text, lineHeight: 20 },

  typeScroll: { marginBottom: SPACING.md },
  typeRow: { gap: SPACING.sm },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.md, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  typeChipOn: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  typeChipText: { fontSize: 12.5, fontFamily: FONTS.sansSemi, color: COLORS.text },
  typeChipTextOn: { color: '#fff' },

  grid: { flexDirection: 'row', gap: SPACING.sm },
  col: { flex: 1 },
  noResults: { alignItems: 'center', paddingTop: SPACING.xl * 3, gap: SPACING.md },
  noResultsIcon: { fontSize: 40, color: COLORS.border },
  noResultsTitle: { fontSize: 20, fontFamily: FONTS.serif, color: COLORS.textSub },
  noResultsSub: { fontSize: 14, fontFamily: FONTS.sans, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.xl },
})

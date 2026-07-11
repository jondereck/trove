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
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { DEFAULT_COLLECTION_ICON, IoniconName } from '../../constants/icons'
import { Save, SaveType, Collection } from '../../types'
import SaveCard from '../../components/SaveCard'
import { searchSaves, searchCollections, fetchSearchSuggestions } from '../../lib/db'
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
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')
  const [type, setType] = useState<TypeId>('all')
  const [results, setResults] = useState<Save[]>([])
  const [collectionHits, setCollectionHits] = useState<Collection[]>([])
  const [searching, setSearching] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [recents, setRecents] = useState<string[]>([])
  const debouncedQuery = useDebounce(query, 350)

  useEffect(() => {
    fetchSearchSuggestions().then(s => setSuggestions(s.length ? s : SAMPLE_SUGGESTIONS))
    getRecentSearches().then(setRecents)
  }, [])

  useEffect(() => {
    const q = debouncedQuery.trim()
    if (!q) {
      setResults([])
      setCollectionHits([])
      setSearching(false)
      return
    }
    let stale = false
    setSearching(true)
    Promise.all([searchSaves(q), searchCollections(q)]).then(([saves, cols]) => {
      if (stale) return
      setResults(saves)
      setCollectionHits(cols)
      setSearching(false)
    })
    return () => { stale = true }
  }, [debouncedQuery])

  // Set the query and remember it as a recent search.
  const runSearch = (term: string) => {
    setQuery(term)
    addRecentSearch(term).then(setRecents)
  }

  // Opening a result is a strong signal the search was useful — record it.
  const openResult = (id: string) => {
    if (debouncedQuery.trim()) addRecentSearch(debouncedQuery).then(setRecents)
    router.push(`/save/${id}`)
  }

  const openCollection = (id: string) => {
    if (debouncedQuery.trim()) addRecentSearch(debouncedQuery).then(setRecents)
    router.push(`/collection/${id}`)
  }

  const hasQuery = debouncedQuery.trim().length > 0
  const shown = type === 'all' ? results : results.filter(r => r.type === type)
  const nothingFound = hasQuery && !searching && shown.length === 0 && collectionHits.length === 0

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>Search</Text>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={COLORS.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search your saves…"
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.typeScroll}
              contentContainerStyle={styles.typeRow}
            >
              {TYPES.map(t => {
                const on = type === t.id
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.typeChip, on && styles.typeChipOn]}
                    onPress={() => setType(t.id)}
                    activeOpacity={0.8}
                  >
                    {t.icon && <Ionicons name={t.icon} size={14} color={on ? '#fff' : COLORS.text} />}
                    <Text style={[styles.typeChipText, on && styles.typeChipTextOn]}>{t.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>

            {searching && <ActivityIndicator color={COLORS.accent} style={styles.loader} />}

            {!searching && collectionHits.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>COLLECTIONS</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.collScroll}
                  contentContainerStyle={styles.collRow}
                >
                  {collectionHits.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.collChip}
                      onPress={() => openCollection(c.id)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.collChipIcon, { backgroundColor: c.color + '22' }]}>
                        <Ionicons name={(c.icon as IoniconName) ?? DEFAULT_COLLECTION_ICON} size={14} color={c.color} />
                      </View>
                      <Text style={styles.collChipText}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {!searching && nothingFound && (
              <View style={styles.noResults}>
                <Ionicons name="search-outline" size={40} color={COLORS.border} />
                <Text style={styles.noResultsTitle}>No results for "{debouncedQuery.trim()}"</Text>
                <Text style={styles.noResultsSub}>Try fewer or different words, or check the type filter.</Text>
              </View>
            )}

            {!searching && shown.length > 0 && (
              <>
                <Text style={styles.resultCount}>
                  {shown.length} {shown.length === 1 ? 'result' : 'results'}
                </Text>
                {shown.map(save => (
                  <SaveCard key={save.id} save={save} onPress={() => openResult(save.id)} />
                ))}
              </>
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

  typeScroll: { marginBottom: SPACING.md, flexGrow: 0 },
  typeRow: { gap: SPACING.sm },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.md, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
    marginRight: SPACING.sm,
  },
  typeChipOn: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  typeChipText: { fontSize: 12.5, fontFamily: FONTS.sansSemi, color: COLORS.text },
  typeChipTextOn: { color: '#fff' },

  loader: { marginTop: SPACING.xl * 2 },

  sectionLabel: { fontSize: 11, fontFamily: FONTS.mono, color: COLORS.muted, letterSpacing: 1, marginBottom: SPACING.sm },
  collScroll: { marginBottom: SPACING.lg, flexGrow: 0 },
  collRow: { gap: SPACING.sm },
  collChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingLeft: 6, paddingRight: SPACING.md, paddingVertical: 5,
    borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
    marginRight: SPACING.sm,
  },
  collChipIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  collChipText: { fontSize: 13, fontFamily: FONTS.sansSemi, color: COLORS.text },

  resultCount: { fontSize: 11, fontFamily: FONTS.mono, color: COLORS.muted, letterSpacing: 1, marginBottom: SPACING.md },
  noResults: { alignItems: 'center', paddingTop: SPACING.xl * 3, gap: SPACING.md },
  noResultsTitle: { fontSize: 20, fontFamily: FONTS.serif, color: COLORS.textSub, textAlign: 'center', paddingHorizontal: SPACING.lg },
  noResultsSub: { fontSize: 14, fontFamily: FONTS.sans, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.xl },
})

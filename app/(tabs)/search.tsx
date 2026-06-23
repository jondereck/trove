import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { Save } from '../../types'
import SaveCard from '../../components/SaveCard'
import { searchSaves } from '../../lib/db'

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
  const [focused, setFocused] = useState(false)
  const [results, setResults] = useState<Save[]>([])
  const [searching, setSearching] = useState(false)
  const debouncedQuery = useDebounce(query, 350)
  const borderColor = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(borderColor, { toValue: focused ? 1 : 0, duration: 180, useNativeDriver: false }).start()
  }, [focused])

  // Fire Supabase query whenever debounced query changes
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

  const animatedBorderColor = borderColor.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.border, COLORS.accent],
  })

  const hasQuery = debouncedQuery.trim().length > 0

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>Search</Text>
        <Animated.View style={[styles.searchBar, { borderColor: animatedBorderColor }]}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search saves, notes, collections…"
            placeholderTextColor={COLORS.muted}
            value={query}
            onChangeText={setQuery}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Text style={styles.clearBtn} onPress={() => setQuery('')}>✕</Text>
          )}
        </Animated.View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!hasQuery && (
          <View style={styles.idle}>
            <Text style={styles.idleText}>Search across all your saves, notes, and collections.</Text>
          </View>
        )}

        {hasQuery && searching && (
          <ActivityIndicator color={COLORS.accent} style={{ marginTop: SPACING.xl * 2 }} />
        )}

        {hasQuery && !searching && results.length === 0 && (
          <View style={styles.noResults}>
            <Text style={styles.noResultsIcon}>◎</Text>
            <Text style={styles.noResultsTitle}>Nothing found</Text>
            <Text style={styles.noResultsSub}>Try a different keyword or check your spelling.</Text>
          </View>
        )}

        {hasQuery && !searching && results.length > 0 && (
          <>
            <Text style={styles.resultCount}>
              {results.length} {results.length === 1 ? 'result' : 'results'}
            </Text>
            {results.map(save => (
              <SaveCard key={save.id} save={save} onPress={() => router.push(`/save/${save.id}`)} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerWrap: {
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md,
    gap: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.bg,
  },
  title: { fontSize: 32, fontFamily: FONTS.serif, color: COLORS.text, letterSpacing: -0.5 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl, borderWidth: 1.5, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.sm,
  },
  searchIcon: { fontSize: 18, color: COLORS.muted, marginTop: -1 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: FONTS.sans, color: COLORS.text, paddingVertical: 0 },
  clearBtn: { fontSize: 13, color: COLORS.muted, paddingHorizontal: SPACING.xs },
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.xl * 2 },
  idle: { paddingTop: SPACING.xl * 2, alignItems: 'center' },
  idleText: { fontSize: 14, fontFamily: FONTS.sans, color: COLORS.muted, textAlign: 'center', lineHeight: 22, maxWidth: 260 },
  resultCount: { fontSize: 12, fontFamily: FONTS.sansMed, color: COLORS.muted, marginBottom: SPACING.md, letterSpacing: 0.3 },
  noResults: { alignItems: 'center', paddingTop: SPACING.xl * 3, gap: SPACING.md },
  noResultsIcon: { fontSize: 40, color: COLORS.border },
  noResultsTitle: { fontSize: 20, fontFamily: FONTS.serif, color: COLORS.textSub },
  noResultsSub: { fontSize: 14, fontFamily: FONTS.sans, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.xl },
})

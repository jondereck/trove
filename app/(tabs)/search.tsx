import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { Save } from '../../types'
import SaveCard from '../../components/SaveCard'
import { MOCK_SAVES } from '../../lib/mockData'

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
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const debouncedQuery = useDebounce(query, 300)
  const borderColor = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(borderColor, {
      toValue: focused ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start()
  }, [focused])

  const animatedBorderColor = borderColor.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.border, COLORS.accent],
  })

  const results: Save[] = debouncedQuery.trim().length === 0
    ? []
    : MOCK_SAVES.filter((s) => {
        const q = debouncedQuery.toLowerCase()
        return (
          s.title.toLowerCase().includes(q) ||
          (s.description ?? '').toLowerCase().includes(q) ||
          (s.content ?? '').toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
        )
        // TODO: replace with supabase.from('saves').select('*').textSearch('title', q)
      })

  const hasQuery = debouncedQuery.trim().length > 0

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
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
            <Text style={styles.idleText}>
              Search across all your saves, notes, and collections.
            </Text>
          </View>
        )}

        {hasQuery && results.length === 0 && (
          <View style={styles.noResults}>
            <Text style={styles.noResultsIcon}>◎</Text>
            <Text style={styles.noResultsTitle}>Nothing found</Text>
            <Text style={styles.noResultsSub}>
              Try a different keyword or check your spelling.
            </Text>
          </View>
        )}

        {hasQuery && results.length > 0 && (
          <>
            <Text style={styles.resultCount}>
              {results.length} {results.length === 1 ? 'result' : 'results'}
            </Text>
            {results.map((save) => (
              <SaveCard key={save.id} save={save} onPress={() => {}} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  headerWrap: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    gap: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  title: {
    fontSize: 32,
    fontFamily: FONTS.serif,
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    borderWidth: 1.5,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  searchIcon: {
    fontSize: 18,
    color: COLORS.muted,
    marginTop: -1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONTS.sans,
    color: COLORS.text,
    paddingVertical: 0,
  },
  clearBtn: {
    fontSize: 13,
    color: COLORS.muted,
    paddingHorizontal: SPACING.xs,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
    gap: 0,
  },
  idle: {
    paddingTop: SPACING.xl * 2,
    alignItems: 'center',
  },
  idleText: {
    fontSize: 14,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 260,
  },
  resultCount: {
    fontSize: 12,
    fontFamily: FONTS.sansMed,
    color: COLORS.muted,
    marginBottom: SPACING.md,
    letterSpacing: 0.3,
  },
  noResults: {
    alignItems: 'center',
    paddingTop: SPACING.xl * 3,
    gap: SPACING.md,
  },
  noResultsIcon: {
    fontSize: 40,
    color: COLORS.border,
  },
  noResultsTitle: {
    fontSize: 20,
    fontFamily: FONTS.serif,
    color: COLORS.textSub,
  },
  noResultsSub: {
    fontSize: 14,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
})

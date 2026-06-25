import { useRef, useState } from 'react'
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, RADIUS, SPACING } from '../constants/theme'
import { dismissOnboarding } from '../lib/firstLaunch'

const SW = Dimensions.get('window').width

type Slide = {
  icon: React.ComponentProps<typeof Ionicons>['name']
  tint: string
  title: string
  body: string
}

const SLIDES: Slide[] = [
  {
    icon: 'bookmark',
    tint: '#f0b3a2',
    title: 'Save anything',
    body: 'Links, notes, images, and videos — all in one calm, organized place. Your private second brain.',
  },
  {
    icon: 'sparkles',
    tint: '#c4b3e0',
    title: 'No account needed',
    body: 'Start saving right away. Everything stays on your device — no sign-up, no friction.',
  },
  {
    icon: 'swap-horizontal',
    tint: '#94d0d2',
    title: 'Yours to keep',
    body: 'Back up and move your saves anytime with a simple export file — fully offline, no account required.',
  },
]

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const listRef = useRef<FlatList<Slide>>(null)
  const [index, setIndex] = useState(0)

  const isLast = index === SLIDES.length - 1

  const finish = () => {
    dismissOnboarding()
    router.replace('/(tabs)')
  }

  const next = () => {
    if (isLast) {
      finish()
    } else {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true })
    }
  }

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SW)
    if (i !== index) setIndex(i)
  }

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity onPress={finish} activeOpacity={0.6} hitSlop={12}>
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={s => s.title}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width: SW }]}>
            <View style={[styles.iconWrap, { backgroundColor: item.tint }]}>
              <Ionicons name={item.icon} size={56} color="#fff" />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACING.xl) }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={next} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>{isLast ? 'Get started' : 'Next'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/(auth)/login')} activeOpacity={0.7} hitSlop={10}>
          <Text style={styles.signIn}>
            I already have an account · <Text style={styles.signInLink}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  topBar: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, alignItems: 'flex-end' },
  skip: { fontFamily: FONTS.sansSemi, fontSize: 15, color: COLORS.muted },

  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  title: { fontFamily: FONTS.serif, fontSize: 38, color: COLORS.text, textAlign: 'center', lineHeight: 42 },
  body: {
    fontFamily: FONTS.sans,
    fontSize: 16,
    color: COLORS.textSub,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 14,
  },

  footer: { paddingHorizontal: 28, gap: SPACING.lg, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.border },
  dotActive: { backgroundColor: COLORS.accent, width: 20 },

  primaryBtn: {
    width: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 17,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 16, fontFamily: FONTS.sansSemi, color: '#fff', letterSpacing: 0.1 },

  signIn: { fontFamily: FONTS.sans, fontSize: 14, color: COLORS.muted },
  signInLink: { fontFamily: FONTS.sansSemi, color: COLORS.accent },
})

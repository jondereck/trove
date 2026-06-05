import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'

const { width: SW } = Dimensions.get('window')

const HERO_BG = '#edc5af'

const CARDS = [
  { color: '#f4b5a5', w: 130, h: 92, top: 18,  left: 52,  rotate: '-9deg'  },
  { color: '#b5d1e8', w: 118, h: 86, top: 8,   left: SW - 148, rotate: '7deg'   },
  { color: '#b5dfca', w: 142, h: 100,top: 122, left: SW - 162, rotate: '-5deg'  },
  { color: '#c6b5e0', w: 132, h: 92, top: 158, left: 82,  rotate: '8deg'   },
  { color: '#a5d5d5', w: 132, h: 94, top: 268, left: 14,  rotate: '-7deg'  },
  { color: '#dfd8a8', w: 134, h: 94, top: 258, left: SW - 156, rotate: '5deg'   },
]

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  return (
    <View style={styles.root}>
      {/* Hero */}
      <View style={[styles.hero, { paddingTop: insets.top }]}>
        {CARDS.map((c, i) => (
          <View
            key={i}
            style={[
              styles.card,
              {
                backgroundColor: c.color,
                width: c.w,
                height: c.h,
                top: c.top + (insets.top > 20 ? insets.top - 20 : 0),
                left: c.left,
                transform: [{ rotate: c.rotate }],
              },
            ]}
          />
        ))}
      </View>

      {/* Content */}
      <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, SPACING.xl) }]}>
        <View style={styles.logoRow}>
          <Text style={styles.wordmark}>Trove</Text>
          <Text style={styles.dot}>.</Text>
        </View>
        <Text style={styles.tagline}>
          Save anything. Let AI sort, tag, and{'\n'}surface it when you need it.
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/(auth)/signup')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Create a free account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push('/(auth)/login')}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryBtnText}>Sign in</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.legal}>
          By continuing you agree to Trove's{' '}
          <Text style={styles.legalLink}>Terms</Text>
          {' & '}
          <Text style={styles.legalLink}>Privacy Policy</Text>.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  hero: {
    height: 380,
    backgroundColor: HERO_BG,
    overflow: 'hidden',
    position: 'relative',
  },
  card: {
    position: 'absolute',
    borderRadius: RADIUS.xl,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl + 4,
    justifyContent: 'space-between',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  wordmark: {
    fontSize: 48,
    fontFamily: FONTS.serif,
    color: COLORS.text,
    letterSpacing: -0.5,
    lineHeight: 54,
  },
  dot: {
    fontSize: 48,
    fontFamily: FONTS.serif,
    color: COLORS.accent,
    lineHeight: 54,
  },
  tagline: {
    fontSize: 15,
    fontFamily: FONTS.sans,
    color: COLORS.textSub,
    lineHeight: 22,
    marginTop: SPACING.sm,
  },
  actions: {
    gap: SPACING.sm,
    marginTop: SPACING.xl,
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: SPACING.md,
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md + 4,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: FONTS.sansSemi,
    color: '#fff',
    letterSpacing: 0.1,
  },
  secondaryBtn: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md + 4,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 16,
    fontFamily: FONTS.sansSemi,
    color: COLORS.text,
    letterSpacing: 0.1,
  },
  legal: {
    fontSize: 12,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 18,
    paddingBottom: SPACING.sm,
  },
  legalLink: {
    color: COLORS.accent,
    fontFamily: FONTS.sansMed,
  },
})

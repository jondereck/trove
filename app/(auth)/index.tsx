import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS, FONTS, SPACING } from '../../constants/theme'
import { BRAND } from '../../constants/branding'

const SW = Dimensions.get('window').width

// Hero background — warm peach from design
const HERO_BG = '#f0c8b1'

// Pastel cards — exact colors from design, fixed layout
const CARDS = [
  // top-left coral pink
  { color: '#f0b3a2', w: 130, h: 93,  top: 18,  left: 54,        rotate: '-8deg'  },
  // top-right periwinkle blue
  { color: '#b3cce8', w: 118, h: 86,  top: 6,   left: SW - 140,  rotate: '7deg'   },
  // mid-left light pink
  { color: '#f3c0b2', w: 135, h: 98,  top: 170, left: 24,        rotate: '-7deg'  },
  // mid-right mint green
  { color: '#b2e0c8', w: 140, h: 100, top: 128, left: SW - 160,  rotate: '-5deg'  },
  // center lavender
  { color: '#c4b3e0', w: 138, h: 94,  top: 230, left: SW / 2 - 69, rotate: '8deg' },
  // bottom-left teal
  { color: '#94d0d2', w: 133, h: 93,  top: 302, left: 12,        rotate: '-7deg'  },
  // bottom-right cream
  { color: '#dbd4a8', w: 135, h: 93,  top: 294, left: SW - 157,  rotate: '6deg'   },
]

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  return (
    <View style={styles.root}>
      {/* Hero — pastel cards scattered on warm peach */}
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
        {/* Wordmark */}
        <View>
          <View style={styles.logoRow}>
            <Text style={styles.wordmark}>{BRAND.name}</Text>
            <Text style={styles.dot}>.</Text>
          </View>
          <Text style={styles.tagline}>{BRAND.tagline}.</Text>
          <Text style={styles.taglineDetail}>{BRAND.welcomeDetail}</Text>
        </View>

        {/* Buttons */}
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

        {/* Legal */}
        <Text style={styles.legal}>
          By continuing you agree to {BRAND.name}'s{' '}
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
    height: 400,
    backgroundColor: HERO_BG,
    overflow: 'hidden',
  },
  card: {
    position: 'absolute',
    borderRadius: 20,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: SPACING.xl,
    justifyContent: 'space-between',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  wordmark: {
    fontSize: 52,
    fontFamily: FONTS.serif,
    color: COLORS.text,
    letterSpacing: -0.5,
    lineHeight: 58,
  },
  dot: {
    fontSize: 52,
    fontFamily: FONTS.serif,
    color: COLORS.accent,
    lineHeight: 58,
  },
  tagline: {
    fontSize: 17,
    fontFamily: FONTS.sansSemi,
    color: COLORS.text,
    lineHeight: 24,
    marginTop: 6,
  },
  taglineDetail: {
    fontSize: 15,
    fontFamily: FONTS.sans,
    color: COLORS.textSub,
    lineHeight: 22,
    marginTop: 4,
  },
  actions: {
    gap: SPACING.sm,
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 17,
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
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingVertical: 17,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 16,
    fontFamily: FONTS.sansSemi,
    color: COLORS.text,
  },
  legal: {
    fontSize: 12,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  legalLink: {
    color: COLORS.accent,
    fontFamily: FONTS.sansMed,
  },
})

import { ReactNode, useRef } from 'react'
import { Animated, PanResponder, Dimensions, StyleSheet, Text, View } from 'react-native'
import { COLORS, FONTS, RADIUS, SPACING } from '../constants/theme'

const { width: SCREEN_W } = Dimensions.get('window')
const THRESHOLD = 110

interface SwipeableCardProps {
  children: ReactNode
  onSwipe: () => void
  /** Label shown on the revealed background. */
  label?: string
}

/**
 * Wraps a card so a horizontal swipe past THRESHOLD fires `onSwipe`.
 * Built on PanResponder so it needs no native gesture libraries. The responder
 * only claims clearly-horizontal gestures, so vertical scroll + tap pass through.
 */
export default function SwipeableCard({ children, onSwipe, label = 'Archive' }: SwipeableCardProps) {
  const translateX = useRef(new Animated.Value(0)).current
  const opacity = useRef(new Animated.Value(1)).current

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
      onPanResponderMove: (_, g) => translateX.setValue(g.dx),
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > THRESHOLD) {
          const to = g.dx > 0 ? SCREEN_W : -SCREEN_W
          Animated.parallel([
            Animated.timing(translateX, { toValue: to, duration: 180, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
          ]).start(() => onSwipe())
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start()
        }
      },
    })
  ).current

  const hintOpacity = translateX.interpolate({
    inputRange: [-THRESHOLD, -24, 0, 24, THRESHOLD],
    outputRange: [1, 0.15, 0, 0.15, 1],
    extrapolate: 'clamp',
  })

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.hint, { opacity: hintOpacity }]} pointerEvents="none">
        <Text style={styles.hintIcon}>✓</Text>
        <Text style={styles.hintText}>{label}</Text>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }], opacity }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  hint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: SPACING.sm,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  hintIcon: { fontSize: 16, color: '#fff' },
  hintText: { fontSize: 14, fontFamily: FONTS.sansSemi, color: '#fff', letterSpacing: 0.3 },
})

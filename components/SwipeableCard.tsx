import { useRef } from 'react'
import { Animated, PanResponder, View, Text, StyleSheet } from 'react-native'
import { COLORS, FONTS, RADIUS, SPACING } from '../constants/theme'

interface SwipeableCardProps {
  children: React.ReactNode
  onArchive: () => void
}

const THRESHOLD = -72

export default function SwipeableCard({ children, onArchive }: SwipeableCardProps) {
  const translateX = useRef(new Animated.Value(0)).current
  const opacity = translateX.interpolate({ inputRange: [THRESHOLD, 0], outputRange: [1, 0] })

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) translateX.setValue(Math.max(g.dx, THRESHOLD * 2))
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < THRESHOLD) {
          Animated.timing(translateX, { toValue: -500, duration: 220, useNativeDriver: true })
            .start(() => onArchive())
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start()
        }
      },
    })
  ).current

  return (
    <View style={styles.wrap}>
      {/* Archive hint revealed on swipe */}
      <Animated.View style={[styles.archiveBg, { opacity }]}>
        <Text style={styles.archiveIcon}>archive</Text>
      </Animated.View>

      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
  },
  archiveBg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.lg,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: SPACING.lg,
  },
  archiveIcon: {
    fontSize: 11,
    fontFamily: FONTS.sansBold,
    color: '#fff',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
})

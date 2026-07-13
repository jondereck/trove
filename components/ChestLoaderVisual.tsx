import { Animated, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ColorPalette, RADIUS } from '../constants/theme'
import { useColors } from '../contexts/ThemeContext'

/** Decorative colors with no palette token. */
const SUCCESS_GREEN = '#2e9e5b'
const SPARKLE_GOLD = '#e9b872'

const CHEST_CLOSED = require('../assets/chest/chest-closed.png')
const CHEST_OPEN = require('../assets/chest/chest-open.png')

interface ChestLoaderVisualProps {
  /** 0..1 across one 3.2s cycle. */
  progress: Animated.Value
  /** Success hold: parked at the end pose (check shown, chest closed). */
  holding: boolean
}

const SPARKLES = [
  { x: -60, y: -18, size: 8, start: 0.42 },
  { x: 58, y: -26, size: 7, start: 0.44 },
  { x: -70, y: 18, size: 6, start: 0.46 },
  { x: 66, y: 14, size: 7, start: 0.43 },
  { x: -30, y: -54, size: 6, start: 0.47 },
  { x: 30, y: -50, size: 7, start: 0.45 },
]

export default function ChestLoaderVisual({ progress }: ChestLoaderVisualProps) {
  const c = useColors()
  const styles = createStyles(c)

  const glowScale = progress.interpolate({
    inputRange: [0, 0.72, 0.9, 1],
    outputRange: [1, 1, 1.3, 1.24],
    extrapolate: 'clamp',
  })
  const glowOpacity = progress.interpolate({
    inputRange: [0, 0.1, 0.72, 0.9, 1],
    outputRange: [0.4, 0.55, 0.5, 0.95, 0.9],
    extrapolate: 'clamp',
  })

  const closedOpacity = progress.interpolate({
    inputRange: [0, 0.19, 0.24, 0.55, 0.6, 1],
    outputRange: [1, 1, 0, 0, 1, 1],
    extrapolate: 'clamp',
  })
  const openOpacity = progress.interpolate({
    inputRange: [0, 0.19, 0.24, 0.55, 0.6, 1],
    outputRange: [0, 0, 1, 1, 0, 0],
    extrapolate: 'clamp',
  })

  const chestScale = progress.interpolate({
    inputRange: [0.71875, 0.81, 0.906, 0.955, 1],
    outputRange: [1, 1.03, 1, 1.05, 1],
    extrapolate: 'clamp',
  })
  const chestSquashY = progress.interpolate({
    inputRange: [0.40625, 0.46, 0.52],
    outputRange: [1, 0.95, 1],
    extrapolate: 'clamp',
  })

  const cardTranslateY = progress.interpolate({
    inputRange: [0, 0.09, 0.1875, 0.36, 0.48],
    outputRange: [-58, -66, -58, -6, 22],
    extrapolate: 'clamp',
  })
  const cardTranslateX = progress.interpolate({
    inputRange: [0.1875, 0.48],
    outputRange: [16, 0],
    extrapolate: 'clamp',
  })
  const cardRotate = progress.interpolate({
    inputRange: [0.1875, 0.32, 0.44],
    outputRange: ['0deg', '-10deg', '0deg'],
    extrapolate: 'clamp',
  })
  const cardScale = progress.interpolate({
    inputRange: [0.40625, 0.52],
    outputRange: [1, 0.55],
    extrapolate: 'clamp',
  })
  const cardOpacity = progress.interpolate({
    inputRange: [0, 0.03, 0.44, 0.52],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  })

  const checkScale = progress.interpolate({
    inputRange: [0.906, 0.965, 1],
    outputRange: [0, 1.15, 1],
    extrapolate: 'clamp',
  })
  const checkOpacity = progress.interpolate({
    inputRange: [0.906, 0.93],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })

  return (
    <View style={styles.stage}>
      <Animated.View
        style={[
          styles.glow,
          { opacity: glowOpacity, transform: [{ scale: glowScale }] },
        ]}
      />

      <Animated.View
        style={[
          styles.card,
          {
            opacity: cardOpacity,
            transform: [
              { translateX: cardTranslateX },
              { translateY: cardTranslateY },
              { rotate: cardRotate },
              { scale: cardScale },
            ],
          },
        ]}
      >
        <View style={styles.cardIcon}>
          <Ionicons name="link" size={16} color={c.accent} />
        </View>
        <View style={styles.cardLines}>
          <View style={[styles.cardLine, { width: 46 }]} />
          <View style={[styles.cardLine, { width: 30 }]} />
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.chest,
          { transform: [{ scale: chestScale }, { scaleY: chestSquashY }] },
        ]}
      >
        <Animated.Image
          source={CHEST_OPEN}
          resizeMode="contain"
          style={[styles.chestImg, { opacity: openOpacity }]}
        />
        <Animated.Image
          source={CHEST_CLOSED}
          resizeMode="contain"
          style={[styles.chestImg, styles.chestImgTop, { opacity: closedOpacity }]}
        />
      </Animated.View>

      {SPARKLES.map((s, i) => {
        const opacity = progress.interpolate({
          inputRange: [s.start, s.start + 0.05, s.start + 0.16],
          outputRange: [0, 1, 0],
          extrapolate: 'clamp',
        })
        const travel = progress.interpolate({
          inputRange: [s.start, s.start + 0.16],
          outputRange: [0, s.y < 0 ? -14 : 12],
          extrapolate: 'clamp',
        })
        return (
          <Animated.View
            key={i}
            style={[
              styles.sparkle,
              {
                width: s.size,
                height: s.size,
                left: 100 + s.x,
                top: 100 + s.y,
                opacity,
                transform: [{ translateY: travel }, { rotate: '45deg' }],
              },
            ]}
          />
        )
      })}

      <Animated.View
        style={[
          styles.checkBadge,
          { opacity: checkOpacity, transform: [{ scale: checkScale }] },
        ]}
      >
        <Ionicons name="checkmark" size={20} color="#ffffff" />
      </Animated.View>
    </View>
  )
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    stage: {
      width: 200,
      height: 200,
      alignItems: 'center',
      justifyContent: 'center',
    },
    glow: {
      position: 'absolute',
      width: 156,
      height: 156,
      borderRadius: 78,
      backgroundColor: c.accentSoft,
    },
    chest: {
      position: 'absolute',
      width: 176,
      height: 176,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chestImg: {
      position: 'absolute',
      width: 176,
      height: 176,
    },
    chestImgTop: {},
    card: {
      position: 'absolute',
      zIndex: 5,
      width: 92,
      height: 52,
      borderRadius: RADIUS.md,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
    },
    cardIcon: {
      width: 26,
      height: 26,
      borderRadius: 8,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    cardLines: {
      flex: 1,
      justifyContent: 'center',
    },
    cardLine: {
      height: 5,
      borderRadius: 3,
      backgroundColor: c.border,
      marginVertical: 2,
    },
    sparkle: {
      position: 'absolute',
      borderRadius: 2,
      backgroundColor: SPARKLE_GOLD,
    },
    checkBadge: {
      position: 'absolute',
      zIndex: 6,
      top: 42,
      right: 30,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: SUCCESS_GREEN,
      borderWidth: 3,
      borderColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
}

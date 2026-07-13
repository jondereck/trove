import { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import LottieView from 'lottie-react-native'
import { ColorPalette, FONTS, SPACING } from '../constants/theme'
import { useThemedStyles } from '../contexts/ThemeContext'
import { UNSORTED_LABEL } from '../constants/labels'

const MIN_DISPLAY_MS = 900

interface ShareSaveAnimationProps {
  active: boolean
}

export { MIN_DISPLAY_MS }

export default function ShareSaveAnimation({ active }: ShareSaveAnimationProps) {
  const styles = useThemedStyles(createStyles)
  const [visible, setVisible] = useState(active)
  const containerOpacity = useRef(new Animated.Value(0)).current
  const dotOpacity = useRef(new Animated.Value(0.3)).current
  const dotLoop = useRef<Animated.CompositeAnimation | null>(null)

  useEffect(() => {
    if (active) {
      setVisible(true)
      Animated.timing(containerOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start()

      dotLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(dotOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(dotOpacity, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        ])
      )
      dotLoop.current.start()

      return () => dotLoop.current?.stop()
    }

    if (visible) {
      dotLoop.current?.stop()
      Animated.timing(containerOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(
        () => setVisible(false)
      )
    }
  }, [active])

  if (!visible) return null

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <View style={styles.content}>
        <LottieView
          source={require('../assets/lottie/chest-save.json')}
          autoPlay
          loop
          style={styles.lottie}
        />

        <View style={styles.titleRow}>
          <Text style={styles.title}>Stashing your link</Text>
          <Animated.Text style={[styles.title, { opacity: dotOpacity }]}>…</Animated.Text>
        </View>
        <Text style={styles.subtitle}>Saving to {UNSORTED_LABEL}</Text>
      </View>
    </Animated.View>
  )
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFill,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.xl,
    },
    lottie: {
      width: 240,
      height: 240,
      marginBottom: SPACING.md,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    title: {
      fontFamily: FONTS.serif,
      fontSize: 22,
      color: c.text,
      textAlign: 'center',
    },
    subtitle: {
      fontFamily: FONTS.sans,
      fontSize: 14,
      color: c.textSub,
      textAlign: 'center',
      marginTop: SPACING.sm,
    },
  })
}

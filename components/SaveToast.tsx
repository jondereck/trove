import { useEffect, useMemo, useRef } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { ColorPalette, FONTS, RADIUS, SPACING } from '../constants/theme'
import { useColors, useThemedStyles } from '../contexts/ThemeContext'

type ToastTone = 'success' | 'neutral' | 'error'

interface SaveToastProps {
  message: string
  tone: ToastTone
  onHide: () => void
}

const ICONS: Record<ToastTone, React.ComponentProps<typeof Ionicons>['name']> = {
  success: 'checkmark-circle',
  neutral: 'information-circle',
  error: 'alert-circle',
}

export default function SaveToast({ message, tone, onHide }: SaveToastProps) {
  const colors = useColors()
  const styles = useThemedStyles(createStyles)
  const translateY = useRef(new Animated.Value(-80)).current
  const opacity = useRef(new Animated.Value(0)).current
  const animatedStyle = useMemo(
    () => ({ opacity, transform: [{ translateY }] }),
    [opacity, translateY]
  )

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        damping: 20,
        stiffness: 220,
        mass: 0.8,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start()

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -50, duration: 180, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start(onHide)
    }, 2200)

    return () => clearTimeout(timer)
  }, [onHide, opacity, translateY])

  return (
    <SafeAreaView edges={['top']} style={styles.host} pointerEvents="none">
      <View style={styles.safeContent}>
        <Animated.View style={[styles.toast, animatedStyle]}>
          <Ionicons name={ICONS[tone]} size={19} color={colors.card} />
          <Text style={styles.message}>{message}</Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  )
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    host: {
      position: 'absolute',
      top: 0,
      right: 0,
      left: 0,
      zIndex: 100,
    },
    safeContent: {
      alignItems: 'center',
      paddingTop: SPACING.sm,
      paddingHorizontal: SPACING.lg,
    },
    toast: {
      minHeight: 44,
      maxWidth: 360,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: c.text,
      shadowColor: c.text,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 12,
      elevation: 8,
    },
    message: {
      flexShrink: 1,
      color: c.card,
      fontFamily: FONTS.sansSemi,
      fontSize: 14,
    },
  })
}

import { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import LottieView from 'lottie-react-native'
import { ColorPalette, FONTS, SPACING } from '../constants/theme'
import { useThemedStyles } from '../contexts/ThemeContext'
import {
  CYCLE_MS,
  FADE_OUT_MS,
  SUCCESS_HOLD_MS,
  resolveLoaderPhase,
  sceneAt,
  type SaveOutcome,
} from '../lib/chestLoaderTimeline'

export { CYCLE_MS, SUCCESS_HOLD_MS, FADE_OUT_MS }

/** Peak check frame before the loop-fade keys (see chest-save checkBadge). */
const HOLD_FRAME = 184

interface ShareSaveAnimationProps {
  active: boolean
  /** Becomes true once quickSaveSharedUrl settles (any outcome). */
  saveCompleted: boolean
  outcome: SaveOutcome
  /** Called after success hold (saved) or immediate fade (duplicate/error), once fade-out finishes. */
  onFinished?: () => void
}

export default function ShareSaveAnimation({
  active,
  saveCompleted,
  outcome,
  onFinished,
}: ShareSaveAnimationProps) {
  const styles = useThemedStyles(createStyles)
  const [visible, setVisible] = useState(active)
  const [scene, setScene] = useState(() => sceneAt(0))
  const containerOpacity = useRef(new Animated.Value(0)).current
  const lottieRef = useRef<LottieView>(null)
  const cycleStartedAt = useRef(0)
  const holdStartedAt = useRef<number | null>(null)
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const finishedRef = useRef(false)
  const saveCompletedRef = useRef(saveCompleted)
  const outcomeRef = useRef(outcome)
  const onFinishedRef = useRef(onFinished)
  const holdingRef = useRef(false)

  saveCompletedRef.current = saveCompleted
  outcomeRef.current = outcome
  onFinishedRef.current = onFinished

  const clearTimers = () => {
    if (tickTimer.current) clearInterval(tickTimer.current)
    tickTimer.current = null
  }

  const fadeOutAndFinish = () => {
    if (finishedRef.current) return
    finishedRef.current = true
    clearTimers()
    Animated.timing(containerOpacity, {
      toValue: 0,
      duration: FADE_OUT_MS,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false)
      onFinishedRef.current?.()
    })
  }

  const beginCycle = () => {
    holdingRef.current = false
    holdStartedAt.current = null
    cycleStartedAt.current = Date.now()
    setScene(sceneAt(0))
    lottieRef.current?.reset()
    lottieRef.current?.play()
  }

  const enterHoldSuccess = () => {
    if (holdingRef.current) return
    holdingRef.current = true
    holdStartedAt.current = Date.now()
    setScene(sceneAt(CYCLE_MS - 1))
    lottieRef.current?.pause()
    lottieRef.current?.play(HOLD_FRAME, HOLD_FRAME)
  }

  const evaluatePhase = () => {
    if (!active || finishedRef.current) return

    const cycleElapsedMs = Date.now() - cycleStartedAt.current
    const holdElapsedMs =
      holdStartedAt.current == null ? 0 : Date.now() - holdStartedAt.current

    const phase = resolveLoaderPhase({
      saveCompleted: saveCompletedRef.current,
      outcome: outcomeRef.current,
      cycleElapsedMs: holdingRef.current ? CYCLE_MS : cycleElapsedMs,
      holdElapsedMs,
    })

    if (!holdingRef.current) {
      setScene(sceneAt(cycleElapsedMs))
    }

    if (phase === 'restartCycle') {
      beginCycle()
      return
    }
    if (phase === 'holdingSuccess') {
      enterHoldSuccess()
      return
    }
    if (phase === 'fadingOut') {
      fadeOutAndFinish()
    }
  }

  useEffect(() => {
    if (!active) {
      clearTimers()
      holdingRef.current = false
      if (visible) {
        Animated.timing(containerOpacity, {
          toValue: 0,
          duration: FADE_OUT_MS,
          useNativeDriver: true,
        }).start(() => setVisible(false))
      }
      return
    }

    finishedRef.current = false
    setVisible(true)
    Animated.timing(containerOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start()

    beginCycle()
    tickTimer.current = setInterval(evaluatePhase, 50)

    return () => clearTimers()
  }, [active])

  useEffect(() => {
    if (!active) return
    evaluatePhase()
  }, [active, saveCompleted, outcome])

  const handleAnimationFinish = () => {
    if (!active || finishedRef.current || holdingRef.current) return
    cycleStartedAt.current = Date.now() - CYCLE_MS
    evaluatePhase()
  }

  if (!visible) return null

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <View style={styles.content}>
        <LottieView
          ref={lottieRef}
          source={require('../assets/lottie/chest-save.json')}
          autoPlay={false}
          loop={false}
          style={styles.lottie}
          onAnimationFinish={handleAnimationFinish}
        />

        <Text style={styles.title}>{scene.title}</Text>
        <Text style={styles.subtitle}>{scene.subtitle}</Text>
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

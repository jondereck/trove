import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import ChestLoaderVisual from './ChestLoaderVisual'
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
  const [holding, setHolding] = useState(false)
  const containerOpacity = useRef(new Animated.Value(0)).current
  const progress = useRef(new Animated.Value(0)).current
  const cycleAnim = useRef<Animated.CompositeAnimation | null>(null)
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

  const stopCycleAnim = () => {
    cycleAnim.current?.stop()
    cycleAnim.current = null
  }

  const fadeOutAndFinish = () => {
    if (finishedRef.current) return
    finishedRef.current = true
    clearTimers()
    stopCycleAnim()
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
    setHolding(false)
    holdStartedAt.current = null
    cycleStartedAt.current = Date.now()
    setScene(sceneAt(0))
    stopCycleAnim()
    progress.setValue(0)
    cycleAnim.current = Animated.timing(progress, {
      toValue: 1,
      duration: CYCLE_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    })
    cycleAnim.current.start(({ finished }) => {
      if (finished) handleCycleComplete()
    })
  }

  const enterHoldSuccess = () => {
    if (holdingRef.current) return
    holdingRef.current = true
    holdStartedAt.current = Date.now()
    setScene(sceneAt(CYCLE_MS - 1))
    stopCycleAnim()
    progress.setValue(1)
    setHolding(true)
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
      stopCycleAnim()
      holdingRef.current = false
      setHolding(false)
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

    return () => {
      clearTimers()
      stopCycleAnim()
    }
  }, [active])

  useEffect(() => {
    if (!active) return
    evaluatePhase()
  }, [active, saveCompleted, outcome])

  const handleCycleComplete = () => {
    if (!active || finishedRef.current || holdingRef.current) return
    cycleStartedAt.current = Date.now() - CYCLE_MS
    evaluatePhase()
  }

  if (!visible) return null

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <View style={styles.content}>
        <ChestLoaderVisual progress={progress} holding={holding} />

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

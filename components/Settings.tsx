import { useEffect, useRef } from 'react'
import { ActivityIndicator, Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ColorPalette, FONTS, RADIUS, SPACING } from '../constants/theme'
import { useColors, useThemedStyles } from '../contexts/ThemeContext'

export const DANGER = '#c4452e'
const DANGER_SOFT_LIGHT = '#f6e0da'
const DANGER_SOFT_DARK = '#3a2420'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    group: { marginBottom: SPACING.xl },
    groupTitle: {
      fontFamily: FONTS.mono,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.muted,
      marginHorizontal: SPACING.lg,
      marginBottom: 9,
    },
    groupCard: {
      marginHorizontal: SPACING.lg,
      backgroundColor: c.card,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },

    row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 15, paddingHorizontal: 16 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: c.border },
    rowDisabled: { opacity: 0.5 },
    rowIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowIconDanger: { backgroundColor: DANGER_SOFT_LIGHT },
    rowText: { flex: 1, gap: 2 },
    rowLabel: { fontFamily: FONTS.sansSemi, fontSize: 15, color: c.text },
    rowHint: { fontFamily: FONTS.sans, fontSize: 12.5, lineHeight: 17, color: c.muted },
    rowValue: { fontFamily: FONTS.sans, fontSize: 14, color: c.muted },

    track: { width: 44, height: 26, borderRadius: 99, justifyContent: 'center' },
    knob: {
      position: 'absolute',
      top: 3,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: '#fff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.25,
      shadowRadius: 2,
      elevation: 2,
    },
  })
}

function trackOffColor(c: ColorPalette) {
  return c.bg === '#121110' ? '#3a3835' : '#d4d0c8'
}

function faintColor(c: ColorPalette) {
  return c.bg === '#121110' ? '#6a6560' : '#bdb9b0'
}

function dangerSoftColor(c: ColorPalette) {
  return c.bg === '#121110' ? DANGER_SOFT_DARK : DANGER_SOFT_LIGHT
}

export function Toggle({
  on,
  onToggle,
  disabled = false,
  busy = false,
  accessibilityLabel,
}: {
  on: boolean
  onToggle: () => void
  disabled?: boolean
  busy?: boolean
  accessibilityLabel?: string
}) {
  const colors = useColors()
  const styles = useThemedStyles(createStyles)
  const x = useRef(new Animated.Value(on ? 1 : 0)).current

  useEffect(() => {
    Animated.timing(x, { toValue: on ? 1 : 0, duration: 200, useNativeDriver: false }).start()
  }, [on, x])

  const left = x.interpolate({ inputRange: [0, 1], outputRange: [3, 21] })
  const bg = x.interpolate({ inputRange: [0, 1], outputRange: [trackOffColor(colors), colors.accent] })

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: on, disabled, busy }}
    >
      <Animated.View style={[styles.track, { backgroundColor: bg }]}>
        <Animated.View style={[styles.knob, { left }]} />
      </Animated.View>
    </TouchableOpacity>
  )
}

export function SettingRow({
  icon,
  label,
  hint,
  value,
  onPress,
  danger,
  toggle,
  on,
  last,
  disabled = false,
  busy = false,
}: {
  icon: IoniconName
  label: string
  hint?: string
  value?: string
  onPress?: () => void
  danger?: boolean
  toggle?: boolean
  on?: boolean
  last?: boolean
  disabled?: boolean
  busy?: boolean
}) {
  const colors = useColors()
  const styles = useThemedStyles(createStyles)

  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowBorder, disabled && styles.rowDisabled]}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={disabled || (!onPress && !toggle)}
      accessible={!toggle}
      accessibilityRole={onPress && !toggle ? 'button' : undefined}
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
    >
      <View style={[styles.rowIcon, danger && { backgroundColor: dangerSoftColor(colors) }]}>
        <Ionicons name={icon} size={18} color={danger ? DANGER : colors.accent} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && { color: DANGER }]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {busy && !toggle ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : toggle ? (
        <Toggle
          on={!!on}
          onToggle={() => onPress?.()}
          disabled={disabled}
          busy={busy}
          accessibilityLabel={label}
        />
      ) : onPress && !danger ? (
        <Ionicons name="chevron-forward" size={18} color={faintColor(colors)} />
      ) : null}
    </TouchableOpacity>
  )
}

export function SettingGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles)

  return (
    <View style={styles.group}>
      {title ? <Text style={styles.groupTitle}>{title}</Text> : null}
      <View style={styles.groupCard}>{children}</View>
    </View>
  )
}

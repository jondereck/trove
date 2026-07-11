import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, RADIUS, SPACING } from '../constants/theme'

export const DANGER = '#c4452e'
const DANGER_SOFT = '#f6e0da'
const FAINT = '#bdb9b0'
const TRACK_OFF = '#d4d0c8'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

// ── Animated on/off switch ──
export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const x = useRef(new Animated.Value(on ? 1 : 0)).current

  useEffect(() => {
    Animated.timing(x, { toValue: on ? 1 : 0, duration: 200, useNativeDriver: false }).start()
  }, [on])

  const left = x.interpolate({ inputRange: [0, 1], outputRange: [3, 21] })
  const bg = x.interpolate({ inputRange: [0, 1], outputRange: [TRACK_OFF, COLORS.accent] })

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onToggle}>
      <Animated.View style={[styles.track, { backgroundColor: bg }]}>
        <Animated.View style={[styles.knob, { left }]} />
      </Animated.View>
    </TouchableOpacity>
  )
}

// ── A single settings row ──
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
}) {
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowBorder]}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={!onPress && !toggle}
    >
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons name={icon} size={18} color={danger ? DANGER : COLORS.accent} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && { color: DANGER }]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {toggle ? (
        <Toggle on={!!on} onToggle={() => onPress?.()} />
      ) : onPress && !danger ? (
        <Ionicons name="chevron-forward" size={18} color={FAINT} />
      ) : null}
    </TouchableOpacity>
  )
}

// ── Grouped card of rows ──
export function SettingGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      {title ? <Text style={styles.groupTitle}>{title}</Text> : null}
      <View style={styles.groupCard}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  group: { marginBottom: SPACING.xl },
  groupTitle: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.muted,
    marginHorizontal: SPACING.lg,
    marginBottom: 9,
  },
  groupCard: {
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 15, paddingHorizontal: 16 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: { backgroundColor: DANGER_SOFT },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: FONTS.sansSemi, fontSize: 15, color: COLORS.text },
  rowHint: { fontFamily: FONTS.sans, fontSize: 12.5, lineHeight: 17, color: COLORS.muted },
  rowValue: { fontFamily: FONTS.sans, fontSize: 14, color: COLORS.muted },

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

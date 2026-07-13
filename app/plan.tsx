import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, RADIUS, SPACING } from '../constants/theme'
import {
  AI_MONTHLY_CAP,
  FREE_COLLECTION_CAP,
  FREE_SAVE_CAP,
  Tier,
} from '../constants/limits'
import { fetchCounts } from '../lib/db'
import { getTier, subscribeTier } from '../lib/entitlements'
import { getAiUsageCount } from '../lib/aiUsage'
import { isLoggedIn } from '../lib/session'
import { requestAuthFlow } from '../lib/authNavigation'
import { canOpenSignUp, showCloudAccountPrompt } from '../lib/authGate'

const FAINT = '#bdb9b0'

type PlanInfo = {
  name: string
  tagline: string
  features: string[]
}

const PLANS: Record<Tier, PlanInfo> = {
  free: {
    name: 'Free',
    tagline: 'Save and organize on this device',
    features: [
      `${FREE_SAVE_CAP} saves`,
      `${FREE_COLLECTION_CAP} collections`,
      `${AI_MONTHLY_CAP.free} AI suggestions per month`,
      'Export your data anytime',
    ],
  },
  unlocked: {
    name: 'Trove Unlocked',
    tagline: 'Unlimited saves on this device',
    features: [
      'Unlimited saves & collections',
      'Unlimited import & export',
      `${AI_MONTHLY_CAP.unlocked} AI suggestions per month`,
      'Works fully offline',
    ],
  },
  cloud: {
    name: 'Trove Cloud',
    tagline: 'Sync across all your devices',
    features: [
      'Everything in Unlocked',
      'Sync across all your devices',
      'Automatic cloud backup',
      'Photos & videos stored in the cloud',
      `${AI_MONTHLY_CAP.cloud.toLocaleString()} AI suggestions per month`,
    ],
  },
}

function UsageMeter({ label, used, cap }: { label: string; used: number; cap: number }) {
  const ratio = cap > 0 ? Math.min(used / cap, 1) : 0
  const nearCap = ratio >= 0.85

  return (
    <View style={styles.meter}>
      <View style={styles.meterHeader}>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={[styles.meterCount, nearCap && styles.meterCountWarn]}>
          {used} / {cap}
        </Text>
      </View>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${ratio * 100}%` }, nearCap && styles.meterFillWarn]} />
      </View>
    </View>
  )
}

export default function PlanScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [tier, setTier] = useState(getTier())
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())
  const [counts, setCounts] = useState({ saves: 0, collections: 0 })
  const [aiUsed, setAiUsed] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => subscribeTier(setTier), [])

  const loadUsage = useCallback(async () => {
    setLoggedIn(isLoggedIn())
    const [nextCounts, nextAi] = await Promise.all([fetchCounts(), getAiUsageCount()])
    setCounts(nextCounts)
    setAiUsed(nextAi)
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadUsage()
    }, [loadUsage])
  )

  const plan = PLANS[tier]
  const showUsage = tier === 'free'

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={styles.topAction}>Settings</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Your plan</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: insets.bottom + SPACING.xl * 2 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.planCard, tier === 'cloud' && styles.planCardCloud]}>
          <View style={styles.planHeader}>
            <Text style={[styles.planName, tier === 'cloud' && styles.planNameLight]}>{plan.name}</Text>
            <Text style={[styles.currentBadge, tier === 'cloud' && styles.currentBadgeLight]}>Current plan</Text>
          </View>
          <Text style={[styles.planTagline, tier === 'cloud' && styles.planTaglineLight]}>{plan.tagline}</Text>
        </View>

        {showUsage && (
          <View style={styles.usageCard}>
            <Text style={styles.sectionTitle}>Usage this month</Text>
            {loading ? (
              <ActivityIndicator color={COLORS.accent} style={styles.usageLoader} />
            ) : (
              <>
                <UsageMeter label="Saves" used={counts.saves} cap={FREE_SAVE_CAP} />
                <UsageMeter label="Collections" used={counts.collections} cap={FREE_COLLECTION_CAP} />
                <UsageMeter label="AI suggestions" used={aiUsed} cap={AI_MONTHLY_CAP.free} />
              </>
            )}
          </View>
        )}

        <View style={styles.featuresCard}>
          <Text style={styles.sectionTitle}>Included</Text>
          {plan.features.map(feature => (
            <View key={feature} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.accent} />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        {tier !== 'cloud' && (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              if (!loggedIn && canOpenSignUp()) {
                showCloudAccountPrompt(router, { onNotNow: () => {} })
                return
              }
              router.push('/upgrade')
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>
              {!loggedIn && canOpenSignUp()
                ? 'Create an account to sync'
                : !loggedIn && tier === 'free'
                  ? 'Get Trove Cloud'
                  : tier === 'unlocked'
                    ? 'Get Trove Cloud'
                    : 'See Trove plans'}
            </Text>
          </TouchableOpacity>
        )}

        {!loggedIn && (
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => {
              requestAuthFlow()
              router.push('/(auth)/login')
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryBtnText}>Already have Cloud? Sign in</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.bg,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, paddingRight: SPACING.sm },
  topAction: { fontFamily: FONTS.sansSemi, fontSize: 15, color: COLORS.accent },
  topTitle: { fontFamily: FONTS.sansBold, fontSize: 16, color: COLORS.text },
  topSpacer: { width: 72 },

  planCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
    padding: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  planCardCloud: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  planName: { fontFamily: FONTS.serif, fontSize: 28, color: COLORS.text },
  planNameLight: { color: '#fff' },
  currentBadge: {
    fontFamily: FONTS.sansSemi,
    fontSize: 11,
    color: COLORS.accent,
    backgroundColor: COLORS.accentSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  currentBadgeLight: {
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  planTagline: { fontFamily: FONTS.sans, fontSize: 14, color: COLORS.textSub, lineHeight: 20 },
  planTaglineLight: { color: 'rgba(255,255,255,0.9)' },

  usageCard: {
    backgroundColor: COLORS.cream,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  usageLoader: { marginVertical: SPACING.sm },
  sectionTitle: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.muted,
  },
  meter: { gap: 6 },
  meterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meterLabel: { fontFamily: FONTS.sansSemi, fontSize: 14, color: COLORS.text },
  meterCount: { fontFamily: FONTS.sansMed, fontSize: 14, color: COLORS.muted },
  meterCountWarn: { color: COLORS.accent },
  meterTrack: {
    height: 6,
    borderRadius: 99,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: COLORS.accent,
  },
  meterFillWarn: { backgroundColor: '#c4452e' },

  featuresCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  featureText: { fontFamily: FONTS.sans, fontSize: 14, color: COLORS.text, flex: 1 },

  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  primaryBtnText: { fontFamily: FONTS.sansSemi, fontSize: 15, color: '#fff' },
  secondaryBtn: { alignItems: 'center', paddingVertical: SPACING.sm },
  secondaryBtnText: { fontFamily: FONTS.sansMed, fontSize: 14, color: FAINT },
})

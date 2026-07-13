import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import Purchases, { PurchasesPackage, PurchasesOfferings } from 'react-native-purchases'
import { ColorPalette, FONTS, RADIUS, SPACING } from '../constants/theme'
import { useColors, useThemedStyles } from '../contexts/ThemeContext'
import {
  FREE_SAVE_CAP,
  FREE_COLLECTION_CAP,
  AI_MONTHLY_CAP,
  PRODUCT_UNLOCKED,
  PRODUCT_CLOUD_MONTHLY,
  PRODUCT_CLOUD_YEARLY,
} from '../constants/limits'
import {
  getTier,
  subscribeTier,
  isPurchasesConfigured,
  restorePurchases,
  applyCustomerInfo,
} from '../lib/entitlements'
import { isLoggedIn } from '../lib/session'
import { showCloudAccountPrompt } from '../lib/authGate'

type BillingPeriod = 'monthly' | 'yearly'

function Feature({ text, muted }: { text: string; muted?: boolean }) {
  const colors = useColors()
  const styles = useThemedStyles(createStyles)
  return (
    <View style={styles.featureRow}>
      <Ionicons
        name="checkmark-circle"
        size={16}
        color={muted ? colors.muted : colors.accent}
      />
      <Text style={[styles.featureText, muted && styles.featureTextMuted]}>{text}</Text>
    </View>
  )
}

export default function UpgradeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useThemedStyles(createStyles)
  const gradient = [colors.accent, '#7a4f86'] as const

  const [tier, setTier] = useState(getTier())
  const [period, setPeriod] = useState<BillingPeriod>('yearly')
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null)
  const [buying, setBuying] = useState(false)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => subscribeTier(setTier), [])

  useEffect(() => {
    if (!isPurchasesConfigured()) return
    Purchases.getOfferings().then(setOfferings).catch(() => {})
  }, [])

  const findPackage = (productId: string): PurchasesPackage | undefined => {
    const all = offerings?.current?.availablePackages ?? []
    return all.find(p => p.product.identifier.startsWith(productId))
  }

  const unlockedPkg = findPackage(PRODUCT_UNLOCKED)
  const cloudPkg = findPackage(period === 'monthly' ? PRODUCT_CLOUD_MONTHLY : PRODUCT_CLOUD_YEARLY)

  const unlockedPrice = unlockedPkg?.product.priceString ?? '₱200'
  const cloudPrice = cloudPkg?.product.priceString ?? (period === 'monthly' ? '₱150' : '₱1,200')

  const buy = async (pkg: PurchasesPackage | undefined, label: string) => {
    if (buying) return
    if (!isPurchasesConfigured() || !pkg) {
      Alert.alert(
        'Not available yet',
        `${label} will be purchasable in the Play Store release build.`
      )
      return
    }
    setBuying(true)
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg)
      applyCustomerInfo(customerInfo)
      const boughtCloud = label === 'Trove Cloud'
      if (boughtCloud && !isLoggedIn()) {
        showCloudAccountPrompt(router)
      } else {
        Alert.alert('Salamat!', 'Your purchase is active. Enjoy Trove!')
        router.back()
      }
    } catch (e: any) {
      if (!e?.userCancelled) {
        Alert.alert('Purchase failed', e?.message ?? 'Please try again.')
      }
    } finally {
      setBuying(false)
    }
  }

  const handleRestore = async () => {
    if (restoring) return
    setRestoring(true)
    const restored = await restorePurchases()
    setRestoring(false)
    if (restored === 'cloud' && !isLoggedIn()) {
      showCloudAccountPrompt(router)
    } else if (restored !== 'free') {
      Alert.alert('Restored', `Your ${restored === 'cloud' ? 'Trove Cloud subscription' : 'Trove Unlocked purchase'} is active.`)
    } else {
      Alert.alert('Nothing to restore', 'No previous purchases were found for this account.')
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.6} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Trove plans</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: SPACING.xl, paddingBottom: insets.bottom + SPACING.xl * 2 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Your library, without limits</Text>
        <Text style={styles.subheading}>
          Pay once to unlock everything on this device. Add Cloud to sync across all your devices.
        </Text>

        {/* Free plan summary */}
        <View style={styles.freeCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planName}>Free</Text>
            {tier === 'free' && <Text style={styles.currentBadge}>Current plan</Text>}
          </View>
          <Feature muted text={`${FREE_SAVE_CAP} saves · ${FREE_COLLECTION_CAP} collections`} />
          <Feature muted text={`${AI_MONTHLY_CAP.free} AI suggestions per month`} />
          <Feature muted text="Export your data anytime — always free" />
        </View>

        {/* Unlocked */}
        <View style={[styles.card, tier === 'unlocked' && styles.cardActive]}>
          <View style={styles.planHeader}>
            <Text style={styles.planName}>Trove Unlocked</Text>
            {tier === 'unlocked' && <Text style={styles.currentBadge}>Current plan</Text>}
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{unlockedPrice}</Text>
            <Text style={styles.priceNote}>one-time, yours forever</Text>
          </View>
          <Feature text="Unlimited saves & collections" />
          <Feature text="Unlimited import & export" />
          <Feature text="AI organize for everyday use" />
          <Feature text="Works fully offline, no account needed" />
          {tier === 'free' && (
            <TouchableOpacity
              style={styles.buyBtn}
              onPress={() => buy(unlockedPkg, 'Trove Unlocked')}
              activeOpacity={0.85}
              disabled={buying}
            >
              {buying
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buyBtnText}>Unlock forever · {unlockedPrice}</Text>}
            </TouchableOpacity>
          )}
        </View>

        {/* Cloud */}
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cloudCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planNameLight}>Trove Cloud</Text>
            {tier === 'cloud' && <Text style={styles.currentBadgeLight}>Current plan</Text>}
          </View>

          <View style={styles.periodToggle}>
            {(['monthly', 'yearly'] as BillingPeriod[]).map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.periodBtn, period === p && styles.periodBtnOn]}
                onPress={() => setPeriod(p)}
                activeOpacity={0.8}
              >
                <Text style={[styles.periodText, period === p && styles.periodTextOn]}>
                  {p === 'monthly' ? 'Monthly' : 'Yearly · 2 months free'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.priceLight}>{cloudPrice}</Text>
            <Text style={styles.priceNoteLight}>{period === 'monthly' ? 'per month' : 'per year'}</Text>
          </View>

          <View style={styles.cloudFeatures}>
            {[
              'Everything in Unlocked',
              'Sync across all your devices',
              'Automatic cloud backup',
              'Photos & videos stored in the cloud',
              `${AI_MONTHLY_CAP.cloud.toLocaleString()} AI suggestions per month`,
            ].map(f => (
              <View key={f} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={styles.featureTextLight}>{f}</Text>
              </View>
            ))}
          </View>

          {tier !== 'cloud' && (
            <TouchableOpacity
              style={styles.buyBtnLight}
              onPress={() => buy(cloudPkg, 'Trove Cloud')}
              activeOpacity={0.85}
              disabled={buying}
            >
              {buying
                ? <ActivityIndicator color={colors.accent} />
                : <Text style={styles.buyBtnLightText}>Subscribe · {cloudPrice}</Text>}
            </TouchableOpacity>
          )}
        </LinearGradient>

        <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} activeOpacity={0.6} disabled={restoring}>
          {restoring
            ? <ActivityIndicator size="small" color={colors.accent} />
            : <Text style={styles.restoreText}>Restore purchases</Text>}
        </TouchableOpacity>

        <Text style={styles.trustLine}>
          Your data is always yours — export works on every plan, free forever.
        </Text>
      </ScrollView>
    </View>
  )
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.sm,
    },
    backBtn: { width: 40 },
    topTitle: {
      flex: 1,
      textAlign: 'center',
      fontFamily: FONTS.sansSemi,
      fontSize: 15,
      color: c.text,
    },
    topSpacer: { width: 40 },

    heading: {
      fontFamily: FONTS.serif,
      fontSize: 32,
      color: c.text,
      marginTop: SPACING.lg,
    },
    subheading: {
      fontFamily: FONTS.sans,
      fontSize: 14,
      lineHeight: 20,
      color: c.textSub,
      marginTop: SPACING.sm,
      marginBottom: SPACING.xl,
    },

    freeCard: {
      backgroundColor: c.cream,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    cardActive: { borderColor: c.accent },
    cloudCard: {
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginBottom: SPACING.xl,
    },

    planHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    planName: { fontFamily: FONTS.serif, fontSize: 22, color: c.text },
    planNameLight: { fontFamily: FONTS.serif, fontSize: 22, color: '#fff' },
    currentBadge: {
      fontFamily: FONTS.sansSemi,
      fontSize: 11,
      color: c.accent,
      backgroundColor: c.accentSoft,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 3,
      borderRadius: RADIUS.sm,
      overflow: 'hidden',
    },
    currentBadgeLight: {
      fontFamily: FONTS.sansSemi,
      fontSize: 11,
      color: '#fff',
      backgroundColor: 'rgba(255,255,255,0.25)',
      paddingHorizontal: SPACING.sm,
      paddingVertical: 3,
      borderRadius: RADIUS.sm,
      overflow: 'hidden',
    },

    priceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    price: { fontFamily: FONTS.sansBold, fontSize: 28, color: c.text },
    priceLight: { fontFamily: FONTS.sansBold, fontSize: 28, color: '#fff' },
    priceNote: { fontFamily: FONTS.sans, fontSize: 13, color: c.muted },
    priceNoteLight: { fontFamily: FONTS.sans, fontSize: 13, color: 'rgba(255,255,255,0.8)' },

    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      marginBottom: SPACING.xs + 2,
    },
    featureText: { fontFamily: FONTS.sans, fontSize: 14, color: c.text, flex: 1 },
    featureTextMuted: { color: c.textSub },
    featureTextLight: { fontFamily: FONTS.sans, fontSize: 14, color: '#fff', flex: 1 },
    cloudFeatures: { marginBottom: SPACING.md },

    periodToggle: {
      flexDirection: 'row',
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderRadius: RADIUS.md,
      padding: 3,
      marginBottom: SPACING.md,
    },
    periodBtn: {
      flex: 1,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.md - 3,
      alignItems: 'center',
    },
    periodBtnOn: { backgroundColor: '#fff' },
    periodText: { fontFamily: FONTS.sansMed, fontSize: 12, color: 'rgba(255,255,255,0.9)' },
    periodTextOn: { color: c.accent },

    buyBtn: {
      backgroundColor: c.accent,
      borderRadius: RADIUS.md,
      paddingVertical: SPACING.md,
      alignItems: 'center',
      marginTop: SPACING.sm,
    },
    buyBtnText: { fontFamily: FONTS.sansSemi, fontSize: 15, color: '#fff' },
    buyBtnLight: {
      backgroundColor: '#fff',
      borderRadius: RADIUS.md,
      paddingVertical: SPACING.md,
      alignItems: 'center',
    },
    buyBtnLightText: { fontFamily: FONTS.sansSemi, fontSize: 15, color: c.accent },

    restoreBtn: { alignItems: 'center', paddingVertical: SPACING.sm },
    restoreText: { fontFamily: FONTS.sansMed, fontSize: 14, color: c.accent },

    trustLine: {
      fontFamily: FONTS.sans,
      fontSize: 12,
      color: c.muted,
      textAlign: 'center',
      marginTop: SPACING.lg,
      lineHeight: 18,
    },
  })
}

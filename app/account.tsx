import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import Constants from 'expo-constants'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { BRAND } from '../constants/branding'
import { ColorPalette, FONTS, RADIUS, SPACING } from '../constants/theme'
import { useColors, useThemedStyles } from '../contexts/ThemeContext'
import Avatar from '../components/Avatar'
import { SettingGroup, SettingRow } from '../components/Settings'
import { fetchCounts, fetchProfile, updateProfile } from '../lib/db'
import { cacheProfile, clearProfileCache, formatProfileName, peekProfile } from '../lib/profileCache'
import { supabase } from '../lib/supabase'
import { isLoggedIn } from '../lib/session'
import { getTier, subscribeTier } from '../lib/entitlements'
import { exportData, importData } from '../lib/transfer'
import { AvatarTooLargeError, pickAndUploadAvatar } from '../lib/storage'
import { requestAuthFlow } from '../lib/authNavigation'
import { shouldPromptAccountForCloud, showCloudAccountPrompt } from '../lib/authGate'

const SUPPORT_EMAIL = 'mailto:jonderecknifas@gmail.com?subject=Trove%20support'

function faintColor(c: ColorPalette) {
  return c.bg === '#121110' ? '#6a6560' : '#bdb9b0'
}

function Stat({
  label,
  value,
  onPress,
  highlight,
}: {
  label: string
  value: string | number
  onPress?: () => void
  highlight?: boolean
}) {
  const colors = useColors()
  const styles = useThemedStyles(createStyles)
  const content = (
    <>
      <Text style={[styles.statValue, highlight && styles.statValueHighlight]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  )

  if (onPress) {
    return (
      <TouchableOpacity style={[styles.stat, styles.statPressable]} onPress={onPress} activeOpacity={0.7}>
        {content}
        <Ionicons name="chevron-forward" size={12} color={faintColor(colors)} style={styles.statChevron} />
      </TouchableOpacity>
    )
  }

  return <View style={styles.stat}>{content}</View>
}

export default function AccountScreen() {
  const colors = useColors()
  const styles = useThemedStyles(createStyles)
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const cached = peekProfile()
  const upgradeGradient = [colors.accent, '#7a4f86'] as const

  const [loggedIn, setLoggedIn] = useState(isLoggedIn())
  const [tier, setTier] = useState(getTier())
  const [profileReady, setProfileReady] = useState(!isLoggedIn() || !!cached)
  const [editing, setEditing] = useState(false)
  const [first, setFirst] = useState(cached?.first_name ?? '')
  const [last, setLast] = useState(cached?.last_name ?? '')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(cached?.avatar_url ?? null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [counts, setCounts] = useState({ saves: 0, collections: 0 })

  const loadProfile = useCallback(async () => {
    const signedIn = isLoggedIn()
    setLoggedIn(signedIn)
    if (signedIn) {
      const { data: { user } } = await supabase.auth.getUser()
      setEmail(user?.email ?? '')
    } else {
      setEmail('')
      clearProfileCache()
    }
    const profile = await fetchProfile()
    setFirst(profile?.first_name ?? '')
    setLast(profile?.last_name ?? '')
    setAvatarUrl(profile?.avatar_url ?? null)
    if (profile) cacheProfile(profile)
    setProfileReady(true)
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadProfile()
      fetchCounts().then(setCounts)
    }, [loadProfile]),
  )

  const handleChangeAvatar = useCallback(async () => {
    if (uploadingAvatar) return
    setUploadingAvatar(true)
    try {
      const url = await pickAndUploadAvatar()
      if (url) setAvatarUrl(url)
    } catch (e: any) {
      const msg = e instanceof AvatarTooLargeError ? e.message : e?.message ?? String(e)
      Alert.alert('Could not update photo', msg)
    } finally {
      setUploadingAvatar(false)
    }
  }, [uploadingAvatar])

  const handleExport = useCallback(async () => {
    try {
      await exportData()
    } catch (e: any) {
      Alert.alert('Export failed', e?.message ?? String(e))
    }
  }, [])

  const handleImport = useCallback(async () => {
    try {
      const res = await importData()
      if (!res) return
      const thumbs = res.thumbnailsRepaired
        ? ` Refetched ${res.thumbnailsRepaired} link preview${res.thumbnailsRepaired === 1 ? '' : 's'}.`
        : ''
      const skipped =
        res.skipped
          ? ` Skipped ${res.skipped} duplicate or empty row${res.skipped === 1 ? '' : 's'}.`
          : ''
      const limited =
        res.limited
          ? ` ${res.limited} item${res.limited === 1 ? '' : 's'} not imported — free plan limit.`
          : ''
      const message =
        res.source === 'raindrop'
          ? `Imported ${res.saves} save${res.saves === 1 ? '' : 's'} from Raindrop (${res.collections} collection${res.collections === 1 ? '' : 's'}).${skipped}${limited}${thumbs}`
          : `Added ${res.saves} saves and ${res.collections} collections.${limited}${thumbs}`
      if (res.limited) {
        Alert.alert('Import complete', message, [
          { text: 'OK', style: 'cancel' },
          { text: 'See plans', onPress: () => router.push('/upgrade') },
        ])
      } else {
        Alert.alert('Import complete', message)
      }
      fetchCounts().then(setCounts)
    } catch (e: any) {
      Alert.alert('Import failed', e?.message ?? String(e))
    }
  }, [router])

  const toggleEditing = useCallback(async () => {
    if (editing) {
      Keyboard.dismiss()
      const ok = await updateProfile({ first_name: first.trim(), last_name: last.trim() })
      if (!ok) {
        Alert.alert('Could not save', 'Your profile changes were not saved. Please try again.')
        return
      }
      await loadProfile()
    }
    setEditing(e => !e)
  }, [editing, first, last, loadProfile])

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          clearProfileCache()
          supabase.auth.signOut()
        },
      },
    ])
  }, [])

  const openLogin = useCallback(() => {
    requestAuthFlow()
    router.push('/(auth)/login')
  }, [router])

  const openCloudSignup = useCallback(() => {
    showCloudAccountPrompt(router, { onNotNow: () => {} })
  }, [router])

  useEffect(() => subscribeTier(setTier), [])

  const planLabel = tier === 'cloud' ? 'Cloud' : tier === 'unlocked' ? 'Unlocked' : 'Free'
  const displayName = loggedIn
    ? formatProfileName(first, last, email)
    : 'Guest'
  const needsCloudAccount = !loggedIn && shouldPromptAccountForCloud()

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color={colors.accent} />
          <Text style={styles.topAction}>Library</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Settings</Text>
        <TouchableOpacity onPress={toggleEditing} activeOpacity={0.6} style={styles.editBtn}>
          <Text style={styles.topAction}>{editing ? 'Done' : 'Edit'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.xl * 2 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.profile}>
          <View>
            <Avatar firstName={first} lastName={last} imageUrl={avatarUrl} size={92} ring />
            {editing && (
              <TouchableOpacity
                style={styles.cameraBadge}
                onPress={handleChangeAvatar}
                disabled={uploadingAvatar}
                activeOpacity={0.7}
              >
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={15} color="#fff" />
                )}
              </TouchableOpacity>
            )}
          </View>

          {editing ? (
            <View style={styles.nameInputs}>
              <TextInput
                value={first}
                onChangeText={setFirst}
                placeholder="First"
                placeholderTextColor={colors.muted}
                style={styles.nameInput}
              />
              <TextInput
                value={last}
                onChangeText={setLast}
                placeholder="Last"
                placeholderTextColor={colors.muted}
                style={styles.nameInput}
              />
            </View>
          ) : profileReady ? (
            <View style={styles.nameBlock}>
              <Text style={styles.name}>{displayName}</Text>
              <Text style={styles.email}>{loggedIn ? email : 'Saving on this device'}</Text>
            </View>
          ) : (
            <View style={styles.nameBlock}>
              <ActivityIndicator color={colors.accent} style={styles.nameLoader} />
            </View>
          )}

          {!editing && (
            <View style={styles.statRow}>
              <Stat label="Saves" value={counts.saves} />
              <View style={styles.statDivider} />
              <Stat label="Collections" value={counts.collections} />
              <View style={styles.statDivider} />
              <Stat
                label="Plan"
                value={planLabel}
                onPress={() => router.push('/plan')}
                highlight={tier === 'free'}
              />
            </View>
          )}
        </View>

        {needsCloudAccount && (
          <TouchableOpacity activeOpacity={0.9} style={styles.bannerWrap} onPress={openCloudSignup}>
            <LinearGradient
              colors={upgradeGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.banner}
            >
              <View style={styles.bannerIcon}>
                <Ionicons name="cloud-outline" size={22} color="#fff" />
              </View>
              <View style={styles.bannerText}>
                <Text style={styles.bannerTitle}>Create an account to sync</Text>
                <Text style={styles.bannerSub}>
                  Cloud is active — sign in so your library syncs across devices
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        <SettingGroup title="Account">
          {loggedIn ? (
            <>
              <SettingRow icon="mail-outline" label="Email" value={email} />
              <SettingRow
                icon="lock-closed-outline"
                label="Change password"
                onPress={() => router.push('/change-password')}
              />
            </>
          ) : (
            <>
              {needsCloudAccount && (
                <SettingRow
                  icon="person-add-outline"
                  label="Create account to sync"
                  onPress={openCloudSignup}
                />
              )}
              <SettingRow
                icon="log-in-outline"
                label="Already have Cloud? Sign in"
                onPress={openLogin}
              />
            </>
          )}
          <SettingRow icon="sparkles-outline" label="Preference" onPress={() => router.push('/ai-preferences')} />
          <SettingRow icon="notifications-outline" label="Notifications" onPress={() => router.push('/notification-settings')} />
          <SettingRow icon="color-palette-outline" label="Appearance" onPress={() => router.push('/appearance')} last />
        </SettingGroup>

        <SettingGroup title="Data">
          <SettingRow icon="cloud-upload-outline" label="Export data" onPress={handleExport} />
          <SettingRow icon="cloud-download-outline" label="Import data" onPress={handleImport} last />
        </SettingGroup>

        <SettingGroup title="Support">
          <SettingRow
            icon="help-circle-outline"
            label="Contact support"
            onPress={() => Linking.openURL(SUPPORT_EMAIL).catch(() => {})}
            last
          />
        </SettingGroup>

        <SettingGroup title="Legal">
          <View style={styles.privacyCard}>
            <View style={styles.privacyBadge}>
              <Ionicons name="shield-checkmark-outline" size={14} color={colors.accent} />
              <Text style={styles.privacyBadgeText}>Privacy notice</Text>
            </View>
            <Text style={styles.privacyBody}>
              Your saves stay on this device by default. If you sign in with {BRAND.name} Cloud,
              your library and account data are synced to our server so you can access them across devices.
            </Text>
          </View>
        </SettingGroup>

        {loggedIn && (
          <SettingGroup>
            <SettingRow icon="log-out-outline" label="Sign out" danger onPress={handleSignOut} last />
          </SettingGroup>
        )}

        <Text style={styles.footer}>Trove v{Constants.expoConfig?.version ?? '1.1.0'} · made with care</Text>
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
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.md,
      backgroundColor: c.bg,
    },
    backBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, paddingRight: SPACING.sm },
    editBtn: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.sm },
    topAction: { fontFamily: FONTS.sansSemi, fontSize: 15, color: c.accent },
    topTitle: { fontFamily: FONTS.sansBold, fontSize: 16, color: c.text },

    profile: { alignItems: 'center', gap: 13, paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm, paddingBottom: 26 },
    cameraBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.accent,
      borderWidth: 3,
      borderColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nameBlock: { alignItems: 'center', minHeight: 52, justifyContent: 'center' },
    nameLoader: { marginVertical: SPACING.sm },
    name: { fontFamily: FONTS.serif, fontSize: 30, color: c.text, lineHeight: 34 },
    email: { fontFamily: FONTS.sans, fontSize: 14, color: c.muted, marginTop: 3 },
    nameInputs: { flexDirection: 'row', gap: 10, width: '100%', maxWidth: 300 },
    nameInput: {
      flex: 1,
      height: 44,
      paddingHorizontal: 12,
      borderRadius: 12,
      textAlign: 'center',
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.card,
      fontFamily: FONTS.sansSemi,
      fontSize: 15,
      color: c.text,
    },

    statRow: {
      flexDirection: 'row',
      marginTop: 6,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      overflow: 'hidden',
    },
    stat: { paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', minWidth: 76 },
    statPressable: { position: 'relative', paddingRight: 24 },
    statChevron: { position: 'absolute', right: 8, top: 14 },
    statValue: { fontFamily: FONTS.serif, fontSize: 24, color: c.text, lineHeight: 26 },
    statValueHighlight: { color: c.accent },
    statLabel: { fontFamily: FONTS.sansSemi, fontSize: 11.5, color: c.muted, marginTop: 4 },
    statDivider: { width: 1, backgroundColor: c.border },

    bannerWrap: { marginHorizontal: SPACING.lg, marginBottom: SPACING.xl, borderRadius: RADIUS.lg, overflow: 'hidden' },
    banner: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 16, paddingHorizontal: 18 },
    bannerIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    bannerText: { flex: 1 },
    bannerTitle: { fontFamily: FONTS.sansBold, fontSize: 15, color: '#fff' },
    bannerSub: { fontFamily: FONTS.sans, fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 1 },

    privacyCard: {
      marginHorizontal: SPACING.lg,
      backgroundColor: c.card,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.lg,
      gap: SPACING.sm,
    },
    privacyBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      backgroundColor: c.accentSoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 99,
    },
    privacyBadgeText: {
      fontFamily: FONTS.sansSemi,
      fontSize: 12,
      color: c.accent,
    },
    privacyBody: {
      fontFamily: FONTS.sans,
      fontSize: 13,
      lineHeight: 19,
      color: c.textSub,
    },

    footer: { textAlign: 'center', fontFamily: FONTS.mono, fontSize: 11, color: faintColor(c), marginTop: 4 },
  })
}

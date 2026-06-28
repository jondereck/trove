import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as WebBrowser from 'expo-web-browser'
import { COLORS, FONTS, RADIUS, SPACING } from '../constants/theme'
import Avatar from '../components/Avatar'
import { SettingGroup, SettingRow } from '../components/Settings'
import { fetchCounts, fetchProfile, updateProfile } from '../lib/db'
import { getSettings, patchSettings } from '../lib/settings'
import { supabase } from '../lib/supabase'
import { isLoggedIn } from '../lib/session'
import { exportData, importData } from '../lib/transfer'
import { AvatarTooLargeError, pickAndUploadAvatar } from '../lib/storage'

// TODO: replace with the real marketing/legal URLs once they exist.
const HELP_URL = 'https://trove.app/help'
const PRIVACY_URL = 'https://trove.app/privacy'

const FAINT = '#bdb9b0'
const UPGRADE_GRADIENT = [COLORS.accent, '#7a4f86'] as const

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

export default function AccountScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [loggedIn] = useState(isLoggedIn())
  const [editing, setEditing] = useState(false)
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [counts, setCounts] = useState({ saves: 0, collections: 0 })
  const [autoOrganize, setAutoOrganize] = useState(true)

  useEffect(() => {
    if (loggedIn) {
      supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email ?? ''))
      fetchProfile().then(p => {
        setFirst(p?.first_name ?? '')
        setLast(p?.last_name ?? '')
        setAvatarUrl(p?.avatar_url ?? null)
      })
    }
    fetchCounts().then(setCounts)
    getSettings().then(s => setAutoOrganize(s.autoOrganize))
  }, [loggedIn])

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
      Alert.alert('Import complete', `Added ${res.saves} saves and ${res.collections} collections.`)
      fetchCounts().then(setCounts)
    } catch (e: any) {
      Alert.alert('Import failed', e?.message ?? String(e))
    }
  }, [])

  const toggleEditing = useCallback(async () => {
    if (editing) {
      Keyboard.dismiss()
      const ok = await updateProfile({ first_name: first.trim(), last_name: last.trim() })
      if (!ok) {
        Alert.alert('Could not save', 'Your profile changes were not saved. Please try again.')
        return
      }
    }
    setEditing(e => !e)
  }, [editing, first, last])

  const toggleAutoOrganize = useCallback(() => {
    setAutoOrganize(prev => {
      const next = !prev
      patchSettings({ autoOrganize: next })
      return next
    })
  }, [])

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ])
  }, [])

  return (
    <View style={styles.container}>
      {/* top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={styles.topAction}>Library</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Account</Text>
        {loggedIn ? (
          <TouchableOpacity onPress={toggleEditing} activeOpacity={0.6} style={styles.editBtn}>
            <Text style={styles.topAction}>{editing ? 'Done' : 'Edit'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.editBtn} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.xl * 2 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* profile */}
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
                placeholderTextColor={COLORS.muted}
                style={styles.nameInput}
              />
              <TextInput
                value={last}
                onChangeText={setLast}
                placeholder="Last"
                placeholderTextColor={COLORS.muted}
                style={styles.nameInput}
              />
            </View>
          ) : (
            <View style={styles.nameBlock}>
              <Text style={styles.name}>{loggedIn ? `${first} ${last}`.trim() || 'Trove' : 'Guest'}</Text>
              <Text style={styles.email}>{loggedIn ? email : 'Saving on this device'}</Text>
            </View>
          )}

          {!editing && (
            <View style={styles.statRow}>
              <Stat label="Saves" value={counts.saves} />
              <View style={styles.statDivider} />
              <Stat label="Collections" value={counts.collections} />
              <View style={styles.statDivider} />
              <Stat label="Plan" value="Free" />
            </View>
          )}
        </View>

        {/* banner: upgrade (signed in) or create-account CTA (guest) */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.bannerWrap}
          onPress={loggedIn ? undefined : () => router.push('/(auth)/')}
        >
          <LinearGradient
            colors={UPGRADE_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.banner}
          >
            <View style={styles.bannerIcon}>
              <Ionicons name={loggedIn ? 'sparkles' : 'cloud-upload'} size={22} color="#fff" />
            </View>
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>
                {loggedIn ? 'Upgrade to Trove Pro' : 'Create a free account'}
              </Text>
              <Text style={styles.bannerSub}>
                {loggedIn ? 'Unlimited AI organize · advanced search' : 'Sync & back up your saves to the cloud'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        {/* settings */}
        <SettingGroup title="Account">
          {loggedIn ? (
            <>
              <SettingRow icon="mail-outline" label="Email" value={email} />
              <SettingRow icon="lock-closed-outline" label="Change password" onPress={() => router.push('/change-password')} />
            </>
          ) : (
            <SettingRow icon="log-in-outline" label="Sign in or create account" onPress={() => router.push('/(auth)/')} />
          )}
          <SettingRow icon="sparkles-outline" label="AI preferences" onPress={() => router.push('/ai-preferences')} last />
        </SettingGroup>

        <SettingGroup title="Preferences">
          <SettingRow
            icon="flash-outline"
            label="Auto-organize new saves"
            toggle
            on={autoOrganize}
            onPress={toggleAutoOrganize}
          />
          <SettingRow icon="folder-outline" label="Default collection" value="Read Later" onPress={() => {}} last />
        </SettingGroup>

        <SettingGroup title="Data">
          <SettingRow icon="cloud-upload-outline" label="Export data" onPress={handleExport} />
          <SettingRow icon="cloud-download-outline" label="Import data" onPress={handleImport} last />
        </SettingGroup>

        <SettingGroup title="Support">
          <SettingRow icon="help-circle-outline" label="Help & FAQ" onPress={() => WebBrowser.openBrowserAsync(HELP_URL)} />
          <SettingRow
            icon="shield-checkmark-outline"
            label="Privacy policy"
            onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}
            last
          />
        </SettingGroup>

        {loggedIn && (
          <SettingGroup>
            <SettingRow icon="log-out-outline" label="Sign out" danger onPress={handleSignOut} last />
          </SettingGroup>
        )}

        <Text style={styles.footer}>Trove v1.0 · made with care</Text>
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
  editBtn: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.sm },
  topAction: { fontFamily: FONTS.sansSemi, fontSize: 15, color: COLORS.accent },
  topTitle: { fontFamily: FONTS.sansBold, fontSize: 16, color: COLORS.text },

  profile: { alignItems: 'center', gap: 13, paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm, paddingBottom: 26 },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.accent,
    borderWidth: 3,
    borderColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameBlock: { alignItems: 'center' },
  name: { fontFamily: FONTS.serif, fontSize: 30, color: COLORS.text, lineHeight: 34 },
  email: { fontFamily: FONTS.sans, fontSize: 14, color: COLORS.muted, marginTop: 3 },
  nameInputs: { flexDirection: 'row', gap: 10, width: '100%', maxWidth: 300 },
  nameInput: {
    flex: 1,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    textAlign: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    fontFamily: FONTS.sansSemi,
    fontSize: 15,
    color: COLORS.text,
  },

  statRow: {
    flexDirection: 'row',
    marginTop: 6,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    overflow: 'hidden',
  },
  stat: { paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', minWidth: 76 },
  statValue: { fontFamily: FONTS.serif, fontSize: 24, color: COLORS.text, lineHeight: 26 },
  statLabel: { fontFamily: FONTS.sansSemi, fontSize: 11.5, color: COLORS.muted, marginTop: 4 },
  statDivider: { width: 1, backgroundColor: COLORS.border },

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

  footer: { textAlign: 'center', fontFamily: FONTS.mono, fontSize: 11, color: FAINT, marginTop: 4 },
})

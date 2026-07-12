import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { COLORS, FONTS, RADIUS, SPACING } from '../constants/theme'
import { supabase } from '../lib/supabase'

const MIN_LENGTH = 8

export default function ChangePasswordScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pwFocused, setPwFocused] = useState(false)
  const [confirmFocused, setConfirmFocused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async () => {
    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password })

    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
    setTimeout(() => router.back(), 900)
  }

  const canSubmit = password.length >= MIN_LENGTH && confirm.length > 0 && !loading

  return (
    <View style={styles.container}>
      {/* top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={styles.topAction}>Settings</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Change password</Text>
        <View style={styles.topSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>Choose a new password for your account.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>NEW PASSWORD</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={[styles.input, styles.passwordInput, pwFocused && styles.inputFocused]}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setPwFocused(true)}
                onBlur={() => setPwFocused(false)}
                placeholder="••••••••"
                placeholderTextColor={COLORS.muted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword(v => !v)}
                activeOpacity={0.7}
              >
                <Text style={styles.eyeIcon}>{showPassword ? '○' : '●'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>CONFIRM PASSWORD</Text>
            <TextInput
              style={[styles.input, confirmFocused && styles.inputFocused]}
              value={confirm}
              onChangeText={setConfirm}
              onFocus={() => setConfirmFocused(true)}
              onBlur={() => setConfirmFocused(false)}
              placeholder="••••••••"
              placeholderTextColor={COLORS.muted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>

          {error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {done ? (
            <View style={styles.successWrap}>
              <Ionicons name="checkmark-circle" size={18} color="#2f855a" />
              <Text style={styles.successText}>Password updated</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.primaryBtn, !canSubmit && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Update password</Text>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },

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

  scroll: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, gap: SPACING.md },
  intro: { fontFamily: FONTS.sans, fontSize: 14, color: COLORS.textSub, marginBottom: SPACING.sm },

  field: { gap: SPACING.xs },
  label: { fontSize: 10, fontFamily: FONTS.sansSemi, color: COLORS.muted, letterSpacing: 1 },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: 15,
    fontFamily: FONTS.sans,
    color: COLORS.text,
  },
  inputFocused: { borderColor: COLORS.accent },
  passwordWrap: { position: 'relative' },
  passwordInput: { paddingRight: 48 },
  eyeBtn: { position: 'absolute', right: SPACING.md, top: 0, bottom: 0, justifyContent: 'center' },
  eyeIcon: { fontSize: 12, color: COLORS.muted },

  errorWrap: {
    backgroundColor: '#fef2f2',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { fontSize: 13, fontFamily: FONTS.sans, color: '#dc2626' },

  successWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: SPACING.sm },
  successText: { fontSize: 15, fontFamily: FONTS.sansSemi, color: '#2f855a' },

  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  btnDisabled: { opacity: 0.45 },
  primaryBtnText: { fontSize: 16, fontFamily: FONTS.sansSemi, color: '#fff', letterSpacing: 0.2 },
})

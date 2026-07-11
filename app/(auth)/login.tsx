import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { Link, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { signInWithGoogle, sendPasswordReset } from '../../lib/auth'
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { clearAuthFlow } from '../../lib/authNavigation'
import { dismissOnboarding } from '../../lib/firstLaunch'

export default function LoginScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const handleSignIn = async () => {
    if (!email.trim() || !password) return
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    setLoading(false)
    if (error) setError(error.message)
    // On success the root layout's onAuthStateChange fires and redirects to (tabs)
  }

  const handleGoogle = async () => {
    setError('')
    setGoogleLoading(true)
    const { error } = await signInWithGoogle()
    setGoogleLoading(false)
    if (error) setError(error)
    // On success the root layout's onAuthStateChange redirects to (tabs)
  }

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email above, then tap "Forgot password?".')
      return
    }
    setError('')
    const { error } = await sendPasswordReset(email)
    if (error) setError(error)
    else setResetSent(true)
  }

  const handleSkip = () => {
    clearAuthFlow()
    dismissOnboarding()
    router.replace('/(tabs)')
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleSkip} activeOpacity={0.65} hitSlop={12}>
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoWrap}>
          <Text style={styles.logoStar}>✦</Text>
          <Text style={styles.wordmark}>Trove</Text>
          <Text style={styles.tagline}>Your personal library.</Text>
        </View>

        {/* Google */}
        <TouchableOpacity
          style={[styles.googleBtn, googleLoading && styles.btnDisabled]}
          onPress={handleGoogle}
          disabled={googleLoading || loading}
          activeOpacity={0.85}
        >
          {googleLoading ? (
            <ActivityIndicator color={COLORS.text} />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color={COLORS.text} />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              style={[styles.input, emailFocused && styles.inputFocused]}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              placeholder="you@example.com"
              placeholderTextColor={COLORS.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>PASSWORD</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={[styles.input, styles.passwordInput, passwordFocused && styles.inputFocused]}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                placeholder="••••••••"
                placeholderTextColor={COLORS.muted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
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

          <TouchableOpacity onPress={handleForgotPassword} activeOpacity={0.7} style={styles.forgotBtn}>
            <Text style={styles.forgotText}>{resetSent ? 'Reset link sent — check your email' : 'Forgot password?'}</Text>
          </TouchableOpacity>

          {error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryBtn, (loading || !email || !password) && styles.btnDisabled]}
            onPress={handleSignIn}
            disabled={loading || !email.trim() || !password}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>Sign In</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>New to Trove? </Text>
          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={styles.footerLink}>Create an account</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  topBar: {
    minHeight: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  skip: {
    color: COLORS.accent,
    fontFamily: FONTS.sansSemi,
    fontSize: 15,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SPACING.xl,
    justifyContent: 'center',
  },

  // Logo
  logoWrap: {
    alignItems: 'center',
    marginBottom: SPACING.xl * 2,
  },
  logoStar: {
    fontSize: 28,
    color: COLORS.accent,
    marginBottom: SPACING.sm,
  },
  wordmark: {
    fontSize: 48,
    fontFamily: FONTS.serif,
    color: COLORS.text,
    letterSpacing: -1,
    lineHeight: 52,
  },
  tagline: {
    fontSize: 16,
    fontFamily: FONTS.serifItal,
    color: COLORS.muted,
    marginTop: SPACING.xs,
  },

  // Google + divider
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md + 2,
  },
  googleBtnText: {
    fontSize: 16,
    fontFamily: FONTS.sansSemi,
    color: COLORS.text,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginVertical: SPACING.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
  },

  // Form
  form: {
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: -SPACING.xs,
  },
  forgotText: {
    fontSize: 13,
    fontFamily: FONTS.sansMed,
    color: COLORS.accent,
  },
  field: {
    gap: SPACING.xs,
  },
  label: {
    fontSize: 10,
    fontFamily: FONTS.sansSemi,
    color: COLORS.muted,
    letterSpacing: 1,
  },
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
  inputFocused: {
    borderColor: COLORS.accent,
  },
  passwordWrap: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeBtn: {
    position: 'absolute',
    right: SPACING.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  eyeIcon: {
    fontSize: 12,
    color: COLORS.muted,
  },
  errorWrap: {
    backgroundColor: '#fef2f2',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    fontSize: 13,
    fontFamily: FONTS.sans,
    color: '#dc2626',
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: FONTS.sansSemi,
    color: '#fff',
    letterSpacing: 0.2,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: SPACING.xl,
  },
  footerText: {
    fontSize: 14,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
  },
  footerLink: {
    fontSize: 14,
    fontFamily: FONTS.sansSemi,
    color: COLORS.accent,
  },
})

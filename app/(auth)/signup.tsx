import { useEffect, useState } from 'react'
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
import { updateProfile } from '../../lib/cloudDb'
import { signInWithGoogle } from '../../lib/auth'
import { ColorPalette, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { useColors, useThemedStyles } from '../../contexts/ThemeContext'
import { BRAND } from '../../constants/branding'
import BrandLogo from '../../components/BrandLogo'
import { canOpenSignUp } from '../../lib/authGate'
import { clearAuthFlow } from '../../lib/authNavigation'

export default function SignupScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const colors = useColors()
  const styles = useThemedStyles(createStyles)
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [allowed, setAllowed] = useState(canOpenSignUp())

  useEffect(() => {
    if (canOpenSignUp()) {
      setAllowed(true)
      return
    }
    setAllowed(false)
    router.replace('/upgrade')
  }, [router])

  if (!allowed) {
    return null
  }

  const handleGoogle = async () => {
    setError('')
    setGoogleLoading(true)
    const { error } = await signInWithGoogle()
    if (error) {
      setGoogleLoading(false)
      setError(error)
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      clearAuthFlow()
      router.replace('/(tabs)')
      return
    }
    setGoogleLoading(false)
  }

  const handleSignUp = async () => {
    setError('')
    if (!email.trim() || !password || !confirm) {
      setError('Please fill in all fields.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    })

    if (error) {
      setLoading(false)
      setError(error.message)
      return
    }

    // Save first name immediately (trigger has already created the profiles row)
    if (firstName.trim()) {
      await updateProfile({ first_name: firstName.trim() })
    }

    if (data.session) {
      clearAuthFlow()
      router.replace('/(tabs)')
      return
    }

    setLoading(false)
    setSuccess(true)
  }

  if (success) {
    return (
      <View style={[styles.root, styles.successWrap, { paddingTop: insets.top }]}>
        <BrandLogo size={64} style={styles.successLogo} />
        <Text style={styles.successTitle}>Check your email</Text>
        <Text style={styles.successBody}>
          We sent a confirmation link to{'\n'}
          <Text style={styles.successEmail}>{email}</Text>
          {'\n\n'}Click the link to activate your account, then come back to sign in.
        </Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.replace('/(auth)/login')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Go to Sign In</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backText}>← Sign in</Text>
        </TouchableOpacity>

        {/* Logo */}
        <View style={styles.logoWrap}>
          <BrandLogo size={72} style={styles.logoImage} />
          <Text style={styles.wordmark}>Create account</Text>
          <Text style={styles.tagline}>{BRAND.signupSubtitle}</Text>
        </View>

        {/* Google */}
        <TouchableOpacity
          style={[styles.googleBtn, googleLoading && styles.btnDisabled]}
          onPress={handleGoogle}
          disabled={googleLoading || loading}
          activeOpacity={0.85}
        >
          {googleLoading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color={colors.text} />
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
            <Text style={styles.label}>FIRST NAME <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={[styles.input, focused === 'firstName' && styles.inputFocused]}
              value={firstName}
              onChangeText={setFirstName}
              onFocus={() => setFocused('firstName')}
              onBlur={() => setFocused(null)}
              placeholder="How should we greet you?"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              style={[styles.input, focused === 'email' && styles.inputFocused]}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
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
                style={[styles.input, styles.passwordInput, focused === 'password' && styles.inputFocused]}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                placeholder="Min. 6 characters"
                placeholderTextColor={colors.muted}
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
              style={[styles.input, focused === 'confirm' && styles.inputFocused]}
              value={confirm}
              onChangeText={setConfirm}
              onFocus={() => setFocused('confirm')}
              onBlur={() => setFocused(null)}
              placeholder="Repeat password"
              placeholderTextColor={colors.muted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSignUp}
            />
          </View>

          {error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>Create Account</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: c.bg,
    },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: SPACING.xl,
      justifyContent: 'center',
    },
    backBtn: {
      marginBottom: SPACING.lg,
    },
    backText: {
      fontSize: 14,
      fontFamily: FONTS.sansMed,
      color: c.muted,
    },

    // Logo
    logoWrap: {
      alignItems: 'center',
      marginBottom: SPACING.xl * 2,
    },
    logoImage: {
      marginBottom: SPACING.sm,
    },
    wordmark: {
      fontSize: 36,
      fontFamily: FONTS.serif,
      color: c.text,
      letterSpacing: -0.5,
      lineHeight: 40,
    },
    tagline: {
      fontSize: 16,
      fontFamily: FONTS.serifItal,
      color: c.muted,
      marginTop: SPACING.xs,
    },

    // Google + divider
    googleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      backgroundColor: c.card,
      borderRadius: RADIUS.md,
      borderWidth: 1.5,
      borderColor: c.border,
      paddingVertical: SPACING.md + 2,
    },
    googleBtnText: {
      fontSize: 16,
      fontFamily: FONTS.sansSemi,
      color: c.text,
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
      backgroundColor: c.border,
    },
    dividerText: {
      fontSize: 13,
      fontFamily: FONTS.sans,
      color: c.muted,
    },

    // Form
    form: {
      gap: SPACING.md,
      marginBottom: SPACING.xl,
    },
    field: {
      gap: SPACING.xs,
    },
    label: {
      fontSize: 10,
      fontFamily: FONTS.sansSemi,
      color: c.muted,
      letterSpacing: 1,
    },
    optional: {
      fontFamily: FONTS.sans,
      letterSpacing: 0,
      textTransform: 'none',
    },
    input: {
      backgroundColor: c.card,
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      fontSize: 15,
      fontFamily: FONTS.sans,
      color: c.text,
    },
    inputFocused: {
      borderColor: c.accent,
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
      color: c.muted,
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
      backgroundColor: c.accent,
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
      color: c.muted,
    },
    footerLink: {
      fontSize: 14,
      fontFamily: FONTS.sansSemi,
      color: c.accent,
    },

    // Success state
    successWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.xl,
      gap: SPACING.md,
    },
    successLogo: {
      marginBottom: SPACING.sm,
    },
    successTitle: {
      fontSize: 28,
      fontFamily: FONTS.serif,
      color: c.text,
    },
    successBody: {
      fontSize: 15,
      fontFamily: FONTS.sans,
      color: c.textSub,
      textAlign: 'center',
      lineHeight: 22,
    },
    successEmail: {
      fontFamily: FONTS.sansMed,
      color: c.text,
    },
  })
}

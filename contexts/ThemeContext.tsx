import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Appearance, ColorSchemeName, StyleSheet } from 'react-native'
import { ColorPalette, paletteForScheme } from '../constants/theme'
import { AppearanceMode, getSettings, patchSettings } from '../lib/settings'

type ThemeContextValue = {
  colors: ColorPalette
  appearance: AppearanceMode
  resolvedScheme: 'light' | 'dark'
  setAppearance: (mode: AppearanceMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function resolveScheme(appearance: AppearanceMode, system: ColorSchemeName): 'light' | 'dark' {
  if (appearance === 'light') return 'light'
  if (appearance === 'dark') return 'dark'
  return system === 'dark' ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setAppearanceState] = useState<AppearanceMode>('system')
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(Appearance.getColorScheme() ?? 'light')

  useEffect(() => {
    getSettings().then(s => setAppearanceState(s.appearance))
  }, [])

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme)
    })
    return () => sub.remove()
  }, [])

  const resolvedScheme = resolveScheme(appearance, systemScheme)
  const colors = useMemo(() => paletteForScheme(resolvedScheme), [resolvedScheme])

  const setAppearance = useCallback((mode: AppearanceMode) => {
    setAppearanceState(mode)
    patchSettings({ appearance: mode }).catch(() => {
      getSettings().then(s => setAppearanceState(s.appearance))
    })
  }, [])

  const value = useMemo(
    () => ({ colors, appearance, resolvedScheme, setAppearance }),
    [colors, appearance, resolvedScheme, setAppearance],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useColors(): ColorPalette {
  const ctx = useContext(ThemeContext)
  return ctx?.colors ?? paletteForScheme('light')
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    return {
      colors: paletteForScheme('light'),
      appearance: 'system',
      resolvedScheme: 'light',
      setAppearance: () => {},
    }
  }
  return ctx
}

export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (colors: ColorPalette) => T,
): T {
  const colors = useColors()
  return useMemo(() => StyleSheet.create(factory(colors)), [colors, factory])
}

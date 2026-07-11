export type ColorPalette = {
  accent: string
  accentSoft: string
  accentBorder: string
  bg: string
  cream: string
  card: string
  border: string
  muted: string
  text: string
  textSub: string
  tabBar: string
  tabBorder: string
}

export const LIGHT_COLORS: ColorPalette = {
  accent: '#c0613c',
  accentSoft: '#fdf0eb',
  accentBorder: '#f0c4b4',
  bg: '#faf9f5',
  cream: '#fdf6ef',
  card: '#ffffff',
  border: '#e8e6e0',
  muted: '#999999',
  text: '#1a1a1a',
  textSub: '#666666',
  tabBar: '#fdf6ef',
  tabBorder: '#e8e6e0',
}

export const DARK_COLORS: ColorPalette = {
  accent: '#d4785a',
  accentSoft: '#3a2a24',
  accentBorder: '#5c4038',
  bg: '#121110',
  cream: '#1a1816',
  card: '#1e1c1a',
  border: '#2e2b28',
  muted: '#8a8580',
  text: '#f2efe9',
  textSub: '#b5b0a8',
  tabBar: '#1a1816',
  tabBorder: '#2e2b28',
}

/** @deprecated Use useColors() from ThemeContext for dynamic theming */
export const COLORS = LIGHT_COLORS

export const FONTS = {
  serif: 'InstrumentSerif_400Regular',
  serifItal: 'InstrumentSerif_400Regular_Italic',
  sans: 'HankenGrotesk_400Regular',
  sansMed: 'HankenGrotesk_500Medium',
  sansSemi: 'HankenGrotesk_600SemiBold',
  sansBold: 'HankenGrotesk_700Bold',
  mono: 'SplineSansMono_400Regular',
  monoMed: 'SplineSansMono_500Medium',
}

export const RADIUS = { sm: 8, md: 12, lg: 18, xl: 24 }
export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }

export function paletteForScheme(scheme: 'light' | 'dark'): ColorPalette {
  return scheme === 'dark' ? DARK_COLORS : LIGHT_COLORS
}

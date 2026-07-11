import { Image, ImageStyle, StyleSheet } from 'react-native'

type Props = {
  size?: number
  style?: ImageStyle
}

export default function BrandLogo({ size = 48, style }: Props) {
  return (
    <Image
      source={require('../assets/icon.png')}
      style={[styles.logo, { width: size, height: size, borderRadius: size * 0.22 }, style]}
      accessibilityLabel="Trove"
    />
  )
}

const styles = StyleSheet.create({
  logo: {
    resizeMode: 'cover',
  },
})

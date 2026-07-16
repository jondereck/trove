import { useVideoPlayer, VideoView } from 'expo-video'
import { StyleSheet, View } from 'react-native'
import { RADIUS, type ColorPalette } from '../constants/theme'
import { useThemedStyles } from '../contexts/ThemeContext'

interface SaveVideoPlayerProps {
  uri: string
}

export default function SaveVideoPlayer({ uri }: SaveVideoPlayerProps) {
  const styles = useThemedStyles(createStyles)
  const player = useVideoPlayer(uri, p => {
    p.loop = false
  })

  return (
    <View style={styles.wrap}>
      <VideoView
        style={styles.video}
        player={player}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
      />
    </View>
  )
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      width: '100%',
      height: 220,
      borderRadius: RADIUS.lg,
      overflow: 'hidden',
      backgroundColor: c.border,
      marginBottom: 4,
    },
    video: {
      width: '100%',
      height: '100%',
    },
  })
}

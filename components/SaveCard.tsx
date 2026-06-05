import { useRef } from 'react'
import { View, Text, Image, Animated, Pressable, StyleSheet } from 'react-native'
import { COLORS, FONTS, SPACING, RADIUS } from '../constants/theme'
import { Save } from '../types'

function getDomain(url?: string): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface SaveCardProps {
  save: Save
  onPress: () => void
}

export default function SaveCard({ save, onPress }: SaveCardProps) {
  const scale = useRef(new Animated.Value(1)).current

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start()

  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start()

  return (
    <Animated.View style={[styles.card, { transform: [{ scale }] }, save.type === 'note' && styles.cardNote]}>
      <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
        {save.type === 'link' && <LinkCard save={save} />}
        {save.type === 'note' && <NoteCard save={save} />}
        {save.type === 'image' && <ImageCard save={save} />}
        {save.type === 'video' && <VideoCard save={save} />}
      </Pressable>
    </Animated.View>
  )
}

function LinkCard({ save }: { save: Save }) {
  const domain = getDomain(save.url)
  return (
    <>
      {save.image_url && (
        <Image source={{ uri: save.image_url }} style={styles.heroImage} resizeMode="cover" />
      )}
      <View style={styles.linkBody}>
        {domain ? (
          <View style={styles.domainPill}>
            <Text style={styles.domainText}>{domain}</Text>
          </View>
        ) : null}
        <Text style={styles.linkTitle} numberOfLines={3}>{save.title}</Text>
        {save.description ? (
          <Text style={styles.linkDesc} numberOfLines={2}>{save.description}</Text>
        ) : null}
        <Text style={styles.date}>{formatDate(save.created_at)}</Text>
      </View>
    </>
  )
}

function NoteCard({ save }: { save: Save }) {
  return (
    <View style={styles.noteBody}>
      <Text style={styles.noteQuote}>"</Text>
      <Text style={styles.noteText} numberOfLines={7}>
        {save.content || save.title}
      </Text>
      <Text style={styles.date}>{formatDate(save.created_at)}</Text>
    </View>
  )
}

function ImageCard({ save }: { save: Save }) {
  return (
    <View style={styles.imageWrap}>
      {save.image_url ? (
        <Image source={{ uri: save.image_url }} style={styles.imageFullBleed} resizeMode="cover" />
      ) : (
        <View style={[styles.imageFullBleed, styles.imagePlaceholder]} />
      )}
      <View style={styles.imageOverlay}>
        <Text style={styles.imageTitle} numberOfLines={2}>{save.title}</Text>
      </View>
    </View>
  )
}

function VideoCard({ save }: { save: Save }) {
  return (
    <View style={styles.imageWrap}>
      {save.image_url ? (
        <Image source={{ uri: save.image_url }} style={styles.videoThumb} resizeMode="cover" />
      ) : (
        <View style={[styles.videoThumb, styles.imagePlaceholder]} />
      )}
      {/* Play button overlay */}
      <View style={styles.playOverlay}>
        <View style={styles.playBtn}>
          <Text style={styles.playIcon}>▶</Text>
        </View>
      </View>
      <View style={styles.videoBadge}>
        <Text style={styles.videoBadgeText}>VIDEO</Text>
      </View>
      <View style={[styles.imageOverlay, { paddingTop: SPACING.xl }]}>
        <Text style={styles.imageTitle} numberOfLines={2}>{save.title}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  cardNote: {
    backgroundColor: COLORS.cream,
    borderColor: '#dddad4',
  },

  // Link
  heroImage: {
    width: '100%',
    height: 130,
  },
  linkBody: {
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  domainPill: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    marginBottom: 2,
  },
  domainText: {
    fontSize: 10,
    fontFamily: FONTS.sansMed,
    color: COLORS.textSub,
    letterSpacing: 0.3,
  },
  linkTitle: {
    fontSize: 14,
    fontFamily: FONTS.serif,
    color: COLORS.text,
    lineHeight: 20,
  },
  linkDesc: {
    fontSize: 12,
    fontFamily: FONTS.sans,
    color: COLORS.textSub,
    lineHeight: 17,
    marginTop: 2,
  },
  date: {
    fontSize: 10,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
    marginTop: SPACING.xs,
  },

  // Note
  noteBody: {
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  noteQuote: {
    fontSize: 32,
    fontFamily: FONTS.serifItal,
    color: COLORS.accent,
    lineHeight: 32,
    marginBottom: -8,
    opacity: 0.6,
  },
  noteText: {
    fontSize: 13,
    fontFamily: FONTS.serifItal,
    color: COLORS.text,
    lineHeight: 20,
  },

  // Image / Video
  imageWrap: {
    position: 'relative',
  },
  imageFullBleed: {
    width: '100%',
    height: 160,
  },
  videoThumb: {
    width: '100%',
    height: 140,
  },
  imagePlaceholder: {
    backgroundColor: COLORS.border,
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: SPACING.md,
    paddingTop: SPACING.xl,
  },
  imageTitle: {
    fontSize: 13,
    fontFamily: FONTS.sansMed,
    color: '#fff',
    lineHeight: 18,
  },
  playOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    fontSize: 14,
    color: COLORS.text,
    marginLeft: 2,
  },
  videoBadge: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  videoBadgeText: {
    fontSize: 9,
    fontFamily: FONTS.sansBold,
    color: '#fff',
    letterSpacing: 0.8,
  },
})

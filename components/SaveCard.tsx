import { useRef, useState } from 'react'
import { View, Text, Image, Animated, Pressable, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons, FontAwesome5 } from '@expo/vector-icons'
import { COLORS, FONTS, SPACING, RADIUS } from '../constants/theme'
import { Save } from '../types'
import { updateSave } from '../lib/db'

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

// Consistent color per string (tags, domains) from a pleasant palette
const CHIP_PALETTE = [
  { bg: '#fde8d8', text: '#b84f2a' }, // burnt orange
  { bg: '#dff4e8', text: '#2a7a4f' }, // green
  { bg: '#e8e8fc', text: '#4a4aaa' }, // indigo
  { bg: '#fce8f3', text: '#a0307a' }, // pink
  { bg: '#e8f4fd', text: '#1a6090' }, // blue
  { bg: '#fdf5d8', text: '#806000' }, // amber
  { bg: '#f0eaf8', text: '#6040a0' }, // violet
  { bg: '#e8f8f0', text: '#1a7050' }, // teal
]

function chipColor(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff
  }
  return CHIP_PALETTE[Math.abs(hash) % CHIP_PALETTE.length]
}

// One row of tag chips — all tags rendered, overflow clips naturally (no shrinking)
function TagChips({ tags }: { tags: string[] }) {
  if (!tags || tags.length === 0) return null
  return (
    <View style={styles.tagRow}>
      {tags.map((tag) => {
        const c = chipColor(tag)
        return (
          <View key={tag} style={[styles.tagChip, { backgroundColor: c.bg }]}>
            <Text style={[styles.tagChipText, { color: c.text }]}>{tag}</Text>
          </View>
        )
      })}
    </View>
  )
}

// Known brand icons (FontAwesome5 brand names + colors)
const BRAND_MAP: Record<string, { icon: string; color: string }> = {
  'facebook.com':    { icon: 'facebook',      color: '#1877F2' },
  'fb.com':          { icon: 'facebook',      color: '#1877F2' },
  'instagram.com':   { icon: 'instagram',     color: '#C13584' },
  'threads.net':     { icon: 'instagram',     color: '#000000' },
  'youtube.com':     { icon: 'youtube',       color: '#FF0000' },
  'youtu.be':        { icon: 'youtube',       color: '#FF0000' },
  'tiktok.com':      { icon: 'tiktok',        color: '#010101' },
  'twitter.com':     { icon: 'twitter',       color: '#1DA1F2' },
  'x.com':           { icon: 'twitter',       color: '#000000' },
  'reddit.com':      { icon: 'reddit-alien',  color: '#FF4500' },
  'linkedin.com':    { icon: 'linkedin',      color: '#0A66C2' },
  'github.com':      { icon: 'github',        color: '#24292E' },
  'spotify.com':     { icon: 'spotify',       color: '#1DB954' },
  'pinterest.com':   { icon: 'pinterest',     color: '#E60023' },
  'snapchat.com':    { icon: 'snapchat',      color: '#FFCB00' },
  'twitch.tv':       { icon: 'twitch',        color: '#9146FF' },
  'discord.com':     { icon: 'discord',       color: '#5865F2' },
  'medium.com':      { icon: 'medium',        color: '#000000' },
  'whatsapp.com':    { icon: 'whatsapp',      color: '#25D366' },
  'telegram.org':    { icon: 'telegram-plane',color: '#229ED9' },
  'vimeo.com':       { icon: 'vimeo',         color: '#1AB7EA' },
  'dribbble.com':    { icon: 'dribbble',      color: '#EA4C89' },
  'behance.net':     { icon: 'behance',       color: '#1769FF' },
  'producthunt.com': { icon: 'product-hunt',  color: '#DA552F' },
  'apple.com':       { icon: 'apple',         color: '#555555' },
  'amazon.com':      { icon: 'amazon',        color: '#FF9900' },
  'google.com':      { icon: 'google',        color: '#4285F4' },
  'microsoft.com':   { icon: 'microsoft',     color: '#00A4EF' },
  'wordpress.com':   { icon: 'wordpress',     color: '#21759B' },
}

// Domain row: real brand icon OR colored letter square fallback
function DomainRow({ domain }: { domain: string }) {
  if (!domain) return null
  const brand = BRAND_MAP[domain]
  const c = chipColor(domain)
  return (
    <View style={styles.domainRow}>
      {brand ? (
        <FontAwesome5 name={brand.icon as any} size={11} color={brand.color} brand />
      ) : (
        <View style={[styles.domainFavicon, { backgroundColor: c.bg }]}>
          <Text style={[styles.domainFaviconLetter, { color: c.text }]}>
            {domain[0].toUpperCase()}
          </Text>
        </View>
      )}
      <Text style={styles.domainText} numberOfLines={1}>{domain}</Text>
    </View>
  )
}

interface SaveCardProps {
  save: Save
  onPress: () => void
  onLongPress?: () => void
  /** undefined = not in selection mode; true/false = selected state */
  selected?: boolean
  onFavoriteToggle?: (isFav: boolean) => void
}

export default function SaveCard({ save, onPress, onLongPress, selected, onFavoriteToggle }: SaveCardProps) {
  const scale = useRef(new Animated.Value(1)).current
  const inSelectionMode = selected !== undefined
  const [isFav, setIsFav] = useState(!!save.is_favorite)
  const [favAnimScale] = useState(new Animated.Value(1))

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start()

  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start()

  const handleFav = async () => {
    const next = !isFav
    setIsFav(next)
    Animated.sequence([
      Animated.spring(favAnimScale, { toValue: 1.35, useNativeDriver: true, speed: 60 }),
      Animated.spring(favAnimScale, { toValue: 1, useNativeDriver: true, speed: 40 }),
    ]).start()
    try {
      await updateSave(save.id, { is_favorite: next })
      onFavoriteToggle?.(next)
    } catch {
      setIsFav(!next)
    }
  }

  return (
    <Animated.View style={[
      styles.card,
      { transform: [{ scale }] },
      save.type === 'note' && styles.cardNote,
      selected && styles.cardSelected,
    ]}>
      <Pressable onPress={onPress} onLongPress={onLongPress} onPressIn={onPressIn} onPressOut={onPressOut}>
        {save.type === 'link' && <LinkCard save={save} />}
        {save.type === 'note' && <NoteCard save={save} />}
        {save.type === 'image' && <ImageCard save={save} />}
        {save.type === 'video' && <VideoCard save={save} />}
      </Pressable>

      {/* Favorite button — unchanged */}
      {!inSelectionMode && (
        <TouchableOpacity
          style={styles.favBtn}
          onPress={handleFav}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Animated.View style={{ transform: [{ scale: favAnimScale }] }}>
            <Ionicons
              name={isFav ? 'heart' : 'heart-outline'}
              size={16}
              color={isFav ? '#e53e3e' : COLORS.muted}
            />
          </Animated.View>
        </TouchableOpacity>
      )}

      {/* Selection mode overlay */}
      {inSelectionMode && (
        <View style={[styles.selectionOverlay, selected && styles.selectionOverlayActive]} pointerEvents="none">
          <View style={[styles.checkCircle, selected && styles.checkCircleActive]}>
            {selected && <Ionicons name="checkmark" size={13} color="#fff" />}
          </View>
        </View>
      )}
    </Animated.View>
  )
}

// ── Card variants ──────────────────────────────────────────────────────────────

function LinkCard({ save }: { save: Save }) {
  const domain = getDomain(save.url)
  const [imgError, setImgError] = useState(false)
  return (
    <>
      {save.image_url && !imgError && (
        <Image
          source={{ uri: save.image_url }}
          style={styles.heroImage}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      )}
      <View style={styles.linkBody}>
        {/* Date above title */}
        <Text style={styles.date}>{formatDate(save.created_at)}</Text>
        <Text style={styles.linkTitle} numberOfLines={3}>{save.title}</Text>
        {save.description ? (
          <Text style={styles.desc} numberOfLines={2}>{save.description}</Text>
        ) : null}
        {/* Domain row */}
        <DomainRow domain={domain} />
        {/* Tags — one row, max 3 */}
        <TagChips tags={save.tags ?? []} />
      </View>
    </>
  )
}

function NoteCard({ save }: { save: Save }) {
  const body = save.content || save.description || ''
  const showTitle = save.title && save.title !== body && save.title !== body.slice(0, 60)
  return (
    <View style={styles.noteBody}>
      <Text style={styles.date}>{formatDate(save.created_at)}</Text>
      <Text style={styles.noteQuote}>"</Text>
      {showTitle && (
        <Text style={styles.noteTitle} numberOfLines={2}>{save.title}</Text>
      )}
      <Text style={styles.noteText} numberOfLines={showTitle ? 5 : 7}>
        {body || save.title}
      </Text>
      <TagChips tags={save.tags ?? []} />
    </View>
  )
}

function ImageCard({ save }: { save: Save }) {
  const [imgError, setImgError] = useState(false)
  return (
    <View>
      <View style={styles.imageWrap}>
        {save.image_url && !imgError ? (
          <Image source={{ uri: save.image_url }} style={styles.imageFullBleed} resizeMode="cover" onError={() => setImgError(true)} />
        ) : (
          <View style={[styles.imageFullBleed, styles.imagePlaceholder]}>
            <Ionicons name="image-outline" size={28} color={COLORS.muted} />
          </View>
        )}
      </View>
      <View style={styles.mediaBody}>
        <Text style={styles.date}>{formatDate(save.created_at)}</Text>
        <Text style={styles.mediaTitle} numberOfLines={2}>{save.title}</Text>
        {save.description ? (
          <Text style={styles.desc} numberOfLines={2}>{save.description}</Text>
        ) : null}
        <TagChips tags={save.tags ?? []} />
      </View>
    </View>
  )
}

function VideoCard({ save }: { save: Save }) {
  const [imgError, setImgError] = useState(false)
  return (
    <View>
      <View style={styles.imageWrap}>
        {save.image_url && !imgError ? (
          <Image source={{ uri: save.image_url }} style={styles.videoThumb} resizeMode="cover" onError={() => setImgError(true)} />
        ) : (
          <View style={[styles.videoThumb, styles.imagePlaceholder]}>
            <Ionicons name="videocam-outline" size={28} color={COLORS.muted} />
          </View>
        )}
        <View style={styles.playOverlay}>
          <View style={styles.playBtn}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </View>
        <View style={styles.videoBadge}>
          <Text style={styles.videoBadgeText}>VIDEO</Text>
        </View>
      </View>
      <View style={styles.mediaBody}>
        <Text style={styles.date}>{formatDate(save.created_at)}</Text>
        <Text style={styles.mediaTitle} numberOfLines={2}>{save.title}</Text>
        {save.description ? (
          <Text style={styles.desc} numberOfLines={2}>{save.description}</Text>
        ) : null}
        <TagChips tags={save.tags ?? []} />
      </View>
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

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
  cardSelected: {
    borderColor: COLORS.accent,
    borderWidth: 2,
  },

  // Favorite button — unchanged
  favBtn: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },

  // Selection overlay
  selectionOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    padding: SPACING.sm,
  },
  selectionOverlayActive: {
    backgroundColor: 'rgba(192, 97, 60, 0.08)',
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.accent,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },

  // Hero image (link cards with OG image)
  heroImage: {
    width: '100%',
    height: 120,
  },

  // Link card body
  linkBody: {
    padding: SPACING.md,
    paddingTop: SPACING.sm,
    gap: 4,
  },
  linkTitle: {
    fontSize: 13,
    fontFamily: FONTS.sansSemi,
    color: COLORS.text,
    lineHeight: 18,
    marginTop: 1,
  },

  // Shared
  date: {
    fontSize: 10,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
  },
  desc: {
    fontSize: 11.5,
    fontFamily: FONTS.sans,
    color: COLORS.textSub,
    lineHeight: 16,
  },

  // Domain row
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  domainFavicon: {
    width: 14,
    height: 14,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  domainFaviconLetter: {
    fontSize: 8,
    fontFamily: FONTS.sansBold,
    lineHeight: 14,
  },
  domainText: {
    fontSize: 11,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
    flexShrink: 1,
  },

  // Tag chips — single row, no wrap
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 5,
    marginTop: 7,
    overflow: 'hidden',
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    flexShrink: 0,  // never compress — let row clip the overflow instead
  },
  tagChipText: {
    fontSize: 11,
    fontFamily: FONTS.sansMed,
    letterSpacing: 0.1,
  },

  // Note card
  noteBody: {
    padding: SPACING.md,
    gap: 4,
  },
  noteQuote: {
    fontSize: 28,
    fontFamily: FONTS.serifItal,
    color: COLORS.accent,
    lineHeight: 28,
    marginBottom: -4,
    opacity: 0.55,
  },
  noteTitle: {
    fontSize: 12,
    fontFamily: FONTS.sansSemi,
    color: COLORS.text,
    lineHeight: 17,
    marginBottom: 2,
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
    height: 150,
  },
  videoThumb: {
    width: '100%',
    height: 130,
  },
  imagePlaceholder: {
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaBody: {
    padding: SPACING.md,
    paddingTop: SPACING.sm,
    gap: 4,
  },
  mediaTitle: {
    fontSize: 13,
    fontFamily: FONTS.sansSemi,
    color: COLORS.text,
    lineHeight: 18,
    marginTop: 1,
  },
  playOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    fontSize: 13,
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

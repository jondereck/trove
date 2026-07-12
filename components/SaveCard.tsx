import { useEffect, useRef, useState } from 'react'
import { View, Text, Image, Animated, Pressable, TouchableOpacity, StyleSheet, Linking } from 'react-native'
import { Ionicons, FontAwesome5 } from '@expo/vector-icons'
import { FONTS, SPACING, RADIUS, LIGHT_COLORS } from '../constants/theme'
import { useColors } from '../contexts/ThemeContext'
import { Save } from '../types'
import { updateSave } from '../lib/db'
import { repairThumbnail } from '../lib/thumbnailRepair'

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
function DomainRow({ domain, colors }: { domain: string; colors: ReturnType<typeof useColors> }) {
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
      <Text style={[styles.domainText, { color: colors.muted }]} numberOfLines={1}>{domain}</Text>
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
  onPinToggle?: (isPinned: boolean) => void
  layout?: 'grid' | 'list'
}

export default function SaveCard({ save, onPress, onLongPress, selected, onFavoriteToggle, onPinToggle, layout = 'grid' }: SaveCardProps) {
  const colors = useColors()
  const scale = useRef(new Animated.Value(1)).current
  const inSelectionMode = selected !== undefined
  const [isFav, setIsFav] = useState(!!save.is_favorite)
  const [isPinned, setIsPinned] = useState(!!save.is_pinned)
  const [favAnimScale] = useState(new Animated.Value(1))
  const isUnread = save.is_viewed === false

  const openLink = () => {
    if (save.url) Linking.openURL(save.url).catch(() => {})
  }

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

  const handlePin = async () => {
    const next = !isPinned
    setIsPinned(next)
    try {
      await updateSave(save.id, { is_pinned: next })
      onPinToggle?.(next)
    } catch {
      setIsPinned(!next)
    }
  }

  return (
    <Animated.View style={[
      styles.card,
      { transform: [{ scale }], backgroundColor: colors.card, borderColor: colors.border },
      save.type === 'note' && [styles.cardNote, { backgroundColor: colors.cream, borderColor: colors.border }],
      isUnread && { borderLeftWidth: 3, borderLeftColor: colors.accent },
      selected && [styles.cardSelected, { borderColor: colors.accent }],
    ]}>
      <Pressable onPress={onPress} onLongPress={onLongPress} onPressIn={onPressIn} onPressOut={onPressOut}>
        {layout === 'list' ? (
          <ListCard save={save} isUnread={isUnread} onOpenLink={openLink} colors={colors} />
        ) : (
          <>
            {save.type === 'link' && <LinkCard save={save} isUnread={isUnread} onOpenLink={openLink} colors={colors} />}
            {save.type === 'note' && <NoteCard save={save} isUnread={isUnread} colors={colors} />}
            {save.type === 'image' && <ImageCard save={save} isUnread={isUnread} colors={colors} />}
            {save.type === 'video' && <VideoCard save={save} isUnread={isUnread} colors={colors} />}
          </>
        )}
      </Pressable>

      {/* Pin + favorite */}
      {!inSelectionMode && (
        <View style={styles.actionBtns}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handlePin}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isPinned ? 'pin' : 'pin-outline'}
              size={16}
              color={isPinned ? colors.accent : colors.muted}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleFav}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Animated.View style={{ transform: [{ scale: favAnimScale }] }}>
              <Ionicons
                name={isFav ? 'heart' : 'heart-outline'}
                size={16}
                color={isFav ? '#e53e3e' : LIGHT_COLORS.muted}
              />
            </Animated.View>
          </TouchableOpacity>
        </View>
      )}

      {/* Selection mode overlay */}
      {inSelectionMode && (
        <View style={[styles.selectionOverlay, selected && styles.selectionOverlayActive]} pointerEvents="none">
          <View style={[styles.checkCircle, { borderColor: colors.accent, backgroundColor: '#fff' }, selected && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
            {selected && <Ionicons name="checkmark" size={13} color="#fff" />}
          </View>
        </View>
      )}
    </Animated.View>
  )
}

// ── Card variants ──────────────────────────────────────────────────────────────

function LinkCard({
  save,
  isUnread,
  onOpenLink,
  colors,
}: {
  save: Save
  isUnread: boolean
  onOpenLink: () => void
  colors: ReturnType<typeof useColors>
}) {
  const domain = getDomain(save.url)
  const [imgError, setImgError] = useState(false)
  const [imageUrl, setImageUrl] = useState(save.image_url)

  // Self-heal a missing or broken thumbnail with one throttled OG refetch
  // (repairThumbnail no-ops if this save was already attempted in the last 24h).
  useEffect(() => {
    if (imageUrl && !imgError) return
    let alive = true
    repairThumbnail(save).then(url => {
      if (alive && url) {
        setImageUrl(url)
        setImgError(false)
      }
    })
    return () => { alive = false }
  }, [imgError, imageUrl])

  return (
    <>
      {imageUrl && !imgError && (
        <TouchableOpacity onPress={onOpenLink} activeOpacity={0.85} disabled={!save.url}>
          <Image
            source={{ uri: imageUrl }}
            style={styles.heroImage}
            resizeMode="cover"
            onError={() => setImgError(true)}
          />
        </TouchableOpacity>
      )}
      <View style={styles.linkBody}>
        <View style={styles.titleRow}>
          {isUnread ? <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} /> : null}
          <Text style={[styles.date, { color: colors.muted }]}>{formatDate(save.created_at)}</Text>
        </View>
        <Text
          style={[styles.linkTitle, { color: colors.text }, isUnread && styles.linkTitleUnread]}
          numberOfLines={3}
        >
          {save.title}
        </Text>
        {save.description ? (
          <Text style={[styles.desc, { color: colors.textSub }]} numberOfLines={2}>{save.description}</Text>
        ) : null}
        <DomainRow domain={domain} colors={colors} />
        <TagChips tags={save.tags ?? []} />
      </View>
    </>
  )
}

function NoteCard({
  save,
  isUnread,
  colors,
}: {
  save: Save
  isUnread: boolean
  colors: ReturnType<typeof useColors>
}) {
  const body = save.content || save.description || ''
  const showTitle = save.title && save.title !== body && save.title !== body.slice(0, 60)
  return (
    <View style={styles.noteBody}>
      <View style={styles.titleRow}>
        {isUnread ? <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} /> : null}
        <Text style={[styles.date, { color: colors.muted }]}>{formatDate(save.created_at)}</Text>
      </View>
      <Text style={[styles.noteQuote, { color: colors.accent }]}>"</Text>
      {showTitle && (
        <Text style={[styles.noteTitle, { color: colors.text }, isUnread && styles.linkTitleUnread]} numberOfLines={2}>
          {save.title}
        </Text>
      )}
      <Text style={[styles.noteText, { color: colors.text }]} numberOfLines={showTitle ? 5 : 7}>
        {body || save.title}
      </Text>
      <TagChips tags={save.tags ?? []} />
    </View>
  )
}

function ImageCard({
  save,
  isUnread,
  colors,
}: {
  save: Save
  isUnread: boolean
  colors: ReturnType<typeof useColors>
}) {
  const [imgError, setImgError] = useState(false)
  return (
    <View>
      <View style={styles.imageWrap}>
        {save.image_url && !imgError ? (
          <Image source={{ uri: save.image_url }} style={styles.imageFullBleed} resizeMode="cover" onError={() => setImgError(true)} />
        ) : (
          <View style={[styles.imageFullBleed, styles.imagePlaceholder, { backgroundColor: colors.border }]}>
            <Ionicons name="image-outline" size={28} color={colors.muted} />
          </View>
        )}
      </View>
      <View style={styles.mediaBody}>
        <View style={styles.titleRow}>
          {isUnread ? <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} /> : null}
          <Text style={[styles.date, { color: colors.muted }]}>{formatDate(save.created_at)}</Text>
        </View>
        <Text style={[styles.mediaTitle, { color: colors.text }, isUnread && styles.linkTitleUnread]} numberOfLines={2}>
          {save.title}
        </Text>
        {save.description ? (
          <Text style={[styles.desc, { color: colors.textSub }]} numberOfLines={2}>{save.description}</Text>
        ) : null}
        <TagChips tags={save.tags ?? []} />
      </View>
    </View>
  )
}

function VideoCard({
  save,
  isUnread,
  colors,
}: {
  save: Save
  isUnread: boolean
  colors: ReturnType<typeof useColors>
}) {
  const [imgError, setImgError] = useState(false)
  return (
    <View>
      <View style={styles.imageWrap}>
        {save.image_url && !imgError ? (
          <Image source={{ uri: save.image_url }} style={styles.videoThumb} resizeMode="cover" onError={() => setImgError(true)} />
        ) : (
          <View style={[styles.videoThumb, styles.imagePlaceholder, { backgroundColor: colors.border }]}>
            <Ionicons name="videocam-outline" size={28} color={colors.muted} />
          </View>
        )}
        <View style={styles.playOverlay}>
          <View style={styles.playBtn}>
            <Text style={[styles.playIcon, { color: colors.text }]}>▶</Text>
          </View>
        </View>
        <View style={styles.videoBadge}>
          <Text style={styles.videoBadgeText}>VIDEO</Text>
        </View>
      </View>
      <View style={styles.mediaBody}>
        <View style={styles.titleRow}>
          {isUnread ? <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} /> : null}
          <Text style={[styles.date, { color: colors.muted }]}>{formatDate(save.created_at)}</Text>
        </View>
        <Text style={[styles.mediaTitle, { color: colors.text }, isUnread && styles.linkTitleUnread]} numberOfLines={2}>
          {save.title}
        </Text>
        {save.description ? (
          <Text style={[styles.desc, { color: colors.textSub }]} numberOfLines={2}>{save.description}</Text>
        ) : null}
        <TagChips tags={save.tags ?? []} />
      </View>
    </View>
  )
}

function ListCard({
  save,
  isUnread,
  onOpenLink,
  colors,
}: {
  save: Save
  isUnread: boolean
  onOpenLink: () => void
  colors: ReturnType<typeof useColors>
}) {
  const domain = getDomain(save.url)
  const [imgError, setImgError] = useState(false)
  const thumb = save.image_url

  useEffect(() => {
    if (thumb && !imgError) return
    if (save.type !== 'link') return
    let alive = true
    repairThumbnail(save).then(url => {
      if (alive && url) setImgError(false)
    })
    return () => { alive = false }
  }, [imgError, thumb, save])

  const typeIcon: keyof typeof Ionicons.glyphMap =
    save.type === 'note' ? 'document-text-outline'
    : save.type === 'image' ? 'image-outline'
    : save.type === 'video' ? 'videocam-outline'
    : 'link-outline'

  return (
    <View style={styles.listRow}>
      {thumb && !imgError ? (
        <TouchableOpacity
          onPress={save.type === 'link' && save.url ? onOpenLink : undefined}
          activeOpacity={save.type === 'link' && save.url ? 0.85 : 1}
          disabled={!(save.type === 'link' && save.url)}
        >
          <Image
            source={{ uri: thumb }}
            style={styles.listThumb}
            resizeMode="cover"
            onError={() => setImgError(true)}
          />
        </TouchableOpacity>
      ) : (
        <View style={[styles.listThumb, styles.listThumbFallback, { backgroundColor: colors.cream }]}>
          <Ionicons name={typeIcon} size={20} color={colors.muted} />
        </View>
      )}
      <View style={styles.listBody}>
        <View style={styles.titleRow}>
          {isUnread ? <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} /> : null}
          <Text style={[styles.listTitle, { color: colors.text }, isUnread && styles.linkTitleUnread]} numberOfLines={2}>
            {save.title}
          </Text>
        </View>
        <View style={styles.listMeta}>
          {domain ? <Text style={[styles.listMetaText, { color: colors.muted }]} numberOfLines={1}>{domain}</Text> : null}
          {domain ? <Text style={[styles.listMetaDot, { color: colors.muted }]}>·</Text> : null}
          <Text style={[styles.listMetaText, { color: colors.muted }]}>{formatDate(save.created_at)}</Text>
        </View>
      </View>
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: LIGHT_COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: LIGHT_COLORS.border,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  cardNote: {
    backgroundColor: LIGHT_COLORS.cream,
    borderColor: '#dddad4',
  },
  cardSelected: {
    borderWidth: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  linkTitleUnread: {
    fontFamily: FONTS.sansBold,
  },

  // Pin + favorite buttons
  actionBtns: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    flexDirection: 'row',
    gap: 4,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: LIGHT_COLORS.border,
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
    borderColor: LIGHT_COLORS.accent,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleActive: {
    backgroundColor: LIGHT_COLORS.accent,
    borderColor: LIGHT_COLORS.accent,
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
    color: LIGHT_COLORS.text,
    lineHeight: 18,
    marginTop: 1,
  },

  // Shared
  date: {
    fontSize: 10,
    fontFamily: FONTS.sans,
    color: LIGHT_COLORS.muted,
  },
  desc: {
    fontSize: 11.5,
    fontFamily: FONTS.sans,
    color: LIGHT_COLORS.textSub,
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
    color: LIGHT_COLORS.muted,
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
    color: LIGHT_COLORS.accent,
    lineHeight: 28,
    marginBottom: -4,
    opacity: 0.55,
  },
  noteTitle: {
    fontSize: 12,
    fontFamily: FONTS.sansSemi,
    color: LIGHT_COLORS.text,
    lineHeight: 17,
    marginBottom: 2,
  },
  noteText: {
    fontSize: 13,
    fontFamily: FONTS.serifItal,
    color: LIGHT_COLORS.text,
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
    backgroundColor: LIGHT_COLORS.border,
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
    color: LIGHT_COLORS.text,
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
    color: LIGHT_COLORS.text,
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

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
  },
  listThumb: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.md,
    backgroundColor: LIGHT_COLORS.border,
  },
  listThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LIGHT_COLORS.cream,
  },
  listBody: { flex: 1, gap: 4 },
  listTitle: {
    fontSize: 15,
    fontFamily: FONTS.sansSemi,
    color: LIGHT_COLORS.text,
    lineHeight: 20,
  },
  listMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  listMetaText: { fontSize: 12, fontFamily: FONTS.sans, color: LIGHT_COLORS.muted },
  listMetaDot: { fontSize: 12, color: LIGHT_COLORS.muted },
})

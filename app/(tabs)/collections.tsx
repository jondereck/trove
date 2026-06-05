import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme'
import { Collection } from '../../types'
import { MOCK_COLLECTIONS } from '../../lib/mockData'

export default function CollectionsScreen() {
  const insets = useSafeAreaInsets()
  const [collections, setCollections] = useState<Collection[]>(MOCK_COLLECTIONS)

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Collections</Text>
        <TouchableOpacity style={styles.newBtn} activeOpacity={0.75}>
          <Text style={styles.newBtnText}>New +</Text>
        </TouchableOpacity>
      </View>

      {collections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>◈</Text>
          <Text style={styles.emptyTitle}>No collections yet</Text>
          <Text style={styles.emptySubtitle}>
            Create a collection to organize your saves.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {collections.map((col) => (
            <CollectionCard key={col.id} collection={col} />
          ))}
        </View>
      )}
    </ScrollView>
  )
}

function CollectionCard({ collection }: { collection: Collection }) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.75}>
      {/* Color accent strip */}
      <View style={[styles.colorStrip, { backgroundColor: collection.color }]} />

      <View style={styles.cardContent}>
        <View style={styles.cardLeft}>
          <Text style={styles.emoji}>{collection.emoji}</Text>
          <View style={styles.cardText}>
            <Text style={styles.cardName}>{collection.name}</Text>
            {collection.description ? (
              <Text style={styles.cardDesc} numberOfLines={1}>
                {collection.description}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.cardRight}>
          <View style={[styles.countBadge, { backgroundColor: collection.color + '22' }]}>
            <Text style={[styles.countText, { color: collection.color }]}>
              {collection.save_count ?? 0}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  title: {
    fontSize: 32,
    fontFamily: FONTS.serif,
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  newBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  newBtnText: {
    fontSize: 13,
    fontFamily: FONTS.sansSemi,
    color: '#fff',
  },
  list: {
    gap: SPACING.sm,
  },

  // Collection card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  colorStrip: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  emoji: {
    fontSize: 22,
    width: 32,
    textAlign: 'center',
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    fontSize: 16,
    fontFamily: FONTS.sansSemi,
    color: COLORS.text,
  },
  cardDesc: {
    fontSize: 12,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  countBadge: {
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    minWidth: 28,
    alignItems: 'center',
  },
  countText: {
    fontSize: 12,
    fontFamily: FONTS.sansBold,
  },
  chevron: {
    fontSize: 20,
    color: COLORS.muted,
    fontFamily: FONTS.sans,
    marginRight: 4,
  },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingTop: SPACING.xl * 4,
    gap: SPACING.md,
  },
  emptyIcon: {
    fontSize: 40,
    color: COLORS.border,
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: FONTS.serif,
    color: COLORS.textSub,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
})

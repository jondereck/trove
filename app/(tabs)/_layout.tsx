import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useShareIntentContext } from 'expo-share-intent'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SPACING } from '../../constants/theme'
import QuickSave from '../../components/QuickSave'
import SaveToast from '../../components/SaveToast'
import { createSave, findSaveByUrl, updateSave, upsertCollectionByName } from '../../lib/db'
import { fetchOGMetadata } from '../../lib/ai'
import type { Draft } from '../../components/QuickSave'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']
type ToastTone = 'success' | 'neutral' | 'error'
type ToastState = { id: number; message: string; tone: ToastTone }

function extractSharedUrl(webUrl?: string | null, text?: string | null): string | null {
  const candidate = webUrl ?? text?.match(/https?:\/\/[^\s]+/i)?.[0]
  if (!candidate) return null

  try {
    const parsed = new URL(candidate.replace(/[),.;!?]+$/, ''))
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

const TAB_CONFIG: Record<string, { label: string; icon: IoniconName; activeIcon: IoniconName }> = {
  index:       { label: 'Library',     icon: 'grid-outline',       activeIcon: 'grid' },
  collections: { label: 'Collections', icon: 'folder-outline',     activeIcon: 'folder' },
  search:      { label: 'Search',      icon: 'search-outline',     activeIcon: 'search' },
  inbox:       { label: 'Inbox',       icon: 'file-tray-outline',  activeIcon: 'file-tray' },
}

function CustomTabBar({ state, navigation, onQuickSave }: any) {
  const insets = useSafeAreaInsets()
  const routes = state.routes

  const renderTab = (route: typeof routes[number], index: number) => {
    const config = TAB_CONFIG[route.name]
    if (!config) return null
    const isFocused = state.index === index

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name)
      }
    }

    return (
      <TouchableOpacity key={route.key} style={styles.tab} onPress={onPress} activeOpacity={0.7}>
        <Ionicons
          name={isFocused ? config.activeIcon : config.icon}
          size={23}
          color={isFocused ? COLORS.accent : COLORS.muted}
        />
        <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
          {config.label}
        </Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[styles.tabBarOuter, { paddingBottom: (insets.bottom || SPACING.md) + SPACING.sm }]}>
      <View style={styles.pill}>
        {routes.slice(0, 2).map((r: typeof routes[number], i: number) => renderTab(r, i))}
        <View style={styles.fabSpacer} />
        {routes.slice(2, 4).map((r: typeof routes[number], i: number) => renderTab(r, i + 2))}

        <TouchableOpacity style={styles.fab} onPress={onQuickSave} activeOpacity={0.85}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  )
}

export default function TabsLayout() {
  const [quickSaveVisible, setQuickSaveVisible] = useState(false)
  const [sharedUrl, setSharedUrl] = useState<string | undefined>()
  const [toast, setToast] = useState<ToastState | null>(null)
  const processingShare = useRef(false)

  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext()

  useEffect(() => {
    if (!hasShareIntent || processingShare.current) return

    const url = extractSharedUrl(shareIntent?.webUrl, shareIntent?.text)
    processingShare.current = true
    resetShareIntent()

    if (!url) {
      setToast({ id: Date.now(), message: 'Share a valid link to Trove', tone: 'error' })
      processingShare.current = false
      return
    }

    void (async () => {
      try {
        const duplicate = await findSaveByUrl(url)
        if (duplicate) {
          setToast({ id: Date.now(), message: 'Already in Trove', tone: 'neutral' })
          return
        }

        const title = new URL(url).hostname.replace(/^www\./, '')
        const save = await createSave({
          url,
          title,
          type: 'link',
          tags: [],
          is_inbox: true,
        })

        if (!save) throw new Error('Save failed')

        setToast({ id: Date.now(), message: 'Saved to Inbox', tone: 'success' })

        void fetchOGMetadata(url)
          .then(metadata => updateSave(save.id, {
            title: metadata.title || title,
            description: metadata.description,
            image_url: metadata.image,
          }))
          .catch(() => {})
      } catch {
        setToast({ id: Date.now(), message: 'Could not save this link', tone: 'error' })
      } finally {
        processingShare.current = false
      }
    })()
  }, [hasShareIntent, shareIntent])

  const hideToast = useCallback(() => setToast(null), [])

  const handleClose = () => {
    setQuickSaveVisible(false)
    setSharedUrl(undefined)
    resetShareIntent()
  }

  const handleSave = async (draft: Draft) => {
    // A chosen collection name files the save directly; empty keeps it in Inbox.
    const name = draft.collection?.trim()
    let collectionId: string | undefined
    let isInbox = true
    if (name) {
      collectionId = (await upsertCollectionByName(name)) ?? undefined
      isInbox = false
    }

    await createSave({
      url: draft.url || undefined,
      title: draft.title,
      description: draft.description || undefined,
      type: draft.type,
      content: draft.type === 'note' ? draft.description : undefined,
      image_url: draft.imageUrl || undefined,
      collection_id: collectionId,
      tags: draft.tags,
      is_inbox: isInbox,
    })
  }

  const handleQuickSave = async () => {
    try {
      const text = await Clipboard.getStringAsync()
      const isUrl = /^https?:\/\//i.test(text.trim())
      if (isUrl) {
        setSharedUrl(text.trim())
      }
    } catch {
      // clipboard unavailable — open normally
    }
    setQuickSaveVisible(true)
  }

  return (
    <>
      <Tabs
        tabBar={(props) => (
          <CustomTabBar {...props} onQuickSave={handleQuickSave} />
        )}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="collections" />
        <Tabs.Screen name="search" />
        <Tabs.Screen name="inbox" />
      </Tabs>

      <QuickSave
        visible={quickSaveVisible}
        onClose={handleClose}
        onSave={handleSave}
        initialUrl={sharedUrl}
      />

      {toast && (
        <SaveToast
          key={toast.id}
          message={toast.message}
          tone={toast.tone}
          onHide={hideToast}
        />
      )}
    </>
  )
}

const styles = StyleSheet.create({
  // Transparent outer so the warm canvas shows through the side + bottom gaps.
  tabBarOuter: {
    backgroundColor: 'transparent',
    paddingTop: SPACING.sm,
  },
  pill: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 62,
    marginHorizontal: SPACING.lg,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#1e140a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: SPACING.xs,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: FONTS.sansMed,
    color: COLORS.muted,
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: COLORS.accent,
    fontFamily: FONTS.sansBold,
  },
  fabSpacer: { width: 58 },
  fab: {
    position: 'absolute',
    left: '50%',
    marginLeft: -29,
    top: -16,
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
})

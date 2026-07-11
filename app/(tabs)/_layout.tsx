import { useCallback, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SPACING } from '../../constants/theme'
import { UNSORTED_LABEL } from '../../constants/labels'
import QuickSave from '../../components/QuickSave'
import SaveToast from '../../components/SaveToast'
import { createSave, upsertCollectionByName } from '../../lib/db'
import { isLimitError, showLimitAlert } from '../../lib/upgradeAlert'
import type { Draft } from '../../components/QuickSave'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']
type ToastTone = 'success' | 'neutral' | 'error'
type ToastState = { id: number; message: string; tone: ToastTone }

const TAB_CONFIG: Record<string, { label: string; icon: IoniconName; activeIcon: IoniconName }> = {
  index:       { label: 'Library',     icon: 'grid-outline',       activeIcon: 'grid' },
  collections: { label: 'Collections', icon: 'folder-outline',     activeIcon: 'folder' },
  search:      { label: 'Search',      icon: 'search-outline',     activeIcon: 'search' },
  inbox:       { label: UNSORTED_LABEL, icon: 'file-tray-outline', activeIcon: 'file-tray' },
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

  const hideToast = useCallback(() => setToast(null), [])

  const handleClose = () => {
    setQuickSaveVisible(false)
    setSharedUrl(undefined)
  }

  const handleSave = async (draft: Draft) => {
    try {
      const name = draft.collection?.trim()
      let collectionId: string | undefined
      let isInbox = true
      if (name) {
        try {
          collectionId = (await upsertCollectionByName(name)) ?? undefined
          isInbox = false
        } catch (e) {
          if (!isLimitError(e)) throw e
        }
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
    } catch (e) {
      if (isLimitError(e)) {
        showLimitAlert(e)
      } else {
        setToast({ id: Date.now(), message: 'Could not save', tone: 'error' })
      }
    }
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

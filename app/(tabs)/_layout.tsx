import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useShareIntentContext } from 'expo-share-intent'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SPACING } from '../../constants/theme'
import QuickSave from '../../components/QuickSave'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

const TAB_CONFIG: Record<string, { label: string; icon: IoniconName; activeIcon: IoniconName }> = {
  index:       { label: 'Library',     icon: 'grid-outline',    activeIcon: 'grid' },
  collections: { label: 'Collections', icon: 'folder-outline',  activeIcon: 'folder' },
  search:      { label: 'Search',      icon: 'search-outline',  activeIcon: 'search' },
  inbox:       { label: 'Inbox',       icon: 'archive-outline', activeIcon: 'archive' },
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
          size={22}
          color={isFocused ? COLORS.accent : COLORS.muted}
        />
        <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
          {config.label}
        </Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom || SPACING.sm }]}>
      <View style={styles.tabRow}>
        {routes.slice(0, 2).map((r: typeof routes[number], i: number) => renderTab(r, i))}

        <TouchableOpacity style={styles.plusWrap} onPress={onQuickSave} activeOpacity={0.85}>
          <View style={styles.plusBtn}>
            <Text style={styles.plusText}>+</Text>
          </View>
        </TouchableOpacity>

        {routes.slice(2, 4).map((r: typeof routes[number], i: number) => renderTab(r, i + 2))}
      </View>
    </View>
  )
}

export default function TabsLayout() {
  const [quickSaveVisible, setQuickSaveVisible] = useState(false)
  const [sharedUrl, setSharedUrl] = useState<string | undefined>()

  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext()

  // When the OS delivers a share intent, open QuickSave with the URL pre-filled.
  // webUrl is populated for both "Share URL" and "Share Page" actions in browsers.
  // Falls back to raw text in case the browser sends a plain-text URL.
  useEffect(() => {
    if (!hasShareIntent) return

    const url = shareIntent?.webUrl ?? (
      shareIntent?.text?.startsWith('http') ? shareIntent.text : undefined
    )

    if (url) {
      setSharedUrl(url)
      setQuickSaveVisible(true)
    }
  }, [hasShareIntent, shareIntent])

  const handleClose = () => {
    setQuickSaveVisible(false)
    setSharedUrl(undefined)
    resetShareIntent()
  }

  return (
    <>
      <Tabs
        tabBar={(props) => (
          <CustomTabBar {...props} onQuickSave={() => setQuickSaveVisible(true)} />
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
        initialUrl={sharedUrl}
      />
    </>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.tabBar,
    borderTopWidth: 1,
    borderTopColor: COLORS.tabBorder,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    paddingHorizontal: SPACING.sm,
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
  },
  plusWrap: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  plusText: {
    color: '#fff',
    fontSize: 24,
    fontFamily: FONTS.sans,
    lineHeight: 28,
    marginTop: -1,
  },
})

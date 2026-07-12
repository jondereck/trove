import { Modal, View, Text, TouchableOpacity, FlatList, StyleSheet, TextInput, Alert } from 'react-native'
import { useMemo, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { FONTS, SPACING } from '../constants/theme'
import { DEFAULT_COLLECTION_ICON, IoniconName } from '../constants/icons'
import { MAX_PINNED_COLLECTIONS } from '../constants/pinLimits'
import { Collection } from '../types'
import { createCollection } from '../lib/db'
import { isLimitError, showLimitAlert } from '../lib/upgradeAlert'
import { useColors, useThemedStyles } from '../contexts/ThemeContext'

interface MoveToCollectionModalProps {
  visible: boolean
  collections: Collection[]
  onClose: () => void
  onSelect: (collectionId: string) => void
  onCreated?: (collection: Collection) => void
  excludeId?: string
}

export default function MoveToCollectionModal({
  visible,
  collections,
  onClose,
  onSelect,
  onCreated,
  excludeId,
}: MoveToCollectionModalProps) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useThemedStyles(c => StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: {
      backgroundColor: c.cream,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.sm,
      maxHeight: '60%',
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      marginBottom: SPACING.lg,
    },
    title: { fontSize: 18, fontFamily: FONTS.serif, color: c.text, marginBottom: SPACING.md },
    sectionLabel: {
      fontSize: 11,
      fontFamily: FONTS.mono,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: c.muted,
      marginBottom: SPACING.xs,
      marginTop: SPACING.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    icon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowName: { flex: 1, fontSize: 15, fontFamily: FONTS.sansMed, color: c.text },
    newRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    newIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accentSoft,
      borderWidth: 1,
      borderColor: c.accentBorder,
      borderStyle: 'dashed',
    },
    newInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: FONTS.sansMed,
      color: c.text,
      paddingVertical: 4,
    },
    empty: {
      fontSize: 14,
      fontFamily: FONTS.sans,
      color: c.muted,
      textAlign: 'center',
      paddingVertical: SPACING.xl,
    },
  }))

  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const rows = useMemo(() => {
    const filtered = excludeId ? collections.filter(c => c.id !== excludeId) : collections
    const pinned = filtered.filter(c => c.is_pinned).slice(0, MAX_PINNED_COLLECTIONS)
    const pinnedIds = new Set(pinned.map(c => c.id))
    const rest = filtered.filter(c => !pinnedIds.has(c.id))
    return { pinned, rest }
  }, [collections, excludeId])

  const resetNew = () => {
    setShowNew(false)
    setNewName('')
  }

  const handleClose = () => {
    resetNew()
    onClose()
  }

  const commitNew = async () => {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const col = await createCollection({ name })
      if (!col) {
        Alert.alert('Could not create collection', 'Please try again.')
        return
      }
      resetNew()
      onCreated?.(col)
      onSelect(col.id)
    } catch (e) {
      if (isLimitError(e)) showLimitAlert(e)
      else Alert.alert('Could not create collection', (e as Error)?.message ?? 'Please try again.')
    } finally {
      setCreating(false)
    }
  }

  const renderCollection = (item: Collection) => (
    <TouchableOpacity
      key={item.id}
      style={styles.row}
      onPress={() => onSelect(item.id)}
      activeOpacity={0.7}
    >
      <View style={[styles.icon, { backgroundColor: item.color + '22' }]}>
        <Ionicons
          name={(item.icon as IoniconName) ?? DEFAULT_COLLECTION_ICON}
          size={18}
          color={item.color}
        />
      </View>
      <Text style={styles.rowName}>{item.name}</Text>
      {item.is_pinned ? (
        <Ionicons name="pin" size={14} color={colors.accent} style={{ marginRight: 4 }} />
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </TouchableOpacity>
  )

  const listData = [
    ...rows.pinned.map(c => ({ type: 'item' as const, item: c })),
    ...(rows.pinned.length > 0 && rows.rest.length > 0 ? [{ type: 'divider' as const }] : []),
    ...rows.rest.map(c => ({ type: 'item' as const, item: c })),
  ]

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} activeOpacity={1} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Move to…</Text>

          <TouchableOpacity
            style={styles.newRow}
            onPress={() => setShowNew(true)}
            activeOpacity={0.7}
            disabled={showNew}
          >
            <View style={styles.newIcon}>
              <Ionicons name="add" size={20} color={colors.accent} />
            </View>
            {showNew ? (
              <TextInput
                style={styles.newInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="New collection name…"
                placeholderTextColor={colors.muted}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={commitNew}
                onBlur={commitNew}
                editable={!creating}
              />
            ) : (
              <Text style={styles.rowName}>Create new collection</Text>
            )}
          </TouchableOpacity>

          {rows.pinned.length > 0 ? (
            <Text style={styles.sectionLabel}>Pinned</Text>
          ) : null}

          <FlatList
            data={listData}
            keyExtractor={(entry, i) => (entry.type === 'item' ? entry.item.id : `div-${i}`)}
            renderItem={({ item: entry }) => {
              if (entry.type === 'divider') {
                return rows.rest.length > 0 ? (
                  <Text style={[styles.sectionLabel, { marginTop: SPACING.md }]}>All collections</Text>
                ) : null
              }
              return renderCollection(entry.item)
            }}
            ListEmptyComponent={
              !showNew ? (
                <Text style={styles.empty}>No collections yet — create one above.</Text>
              ) : null
            }
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  )
}

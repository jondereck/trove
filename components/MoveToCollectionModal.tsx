import { Modal, View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SPACING } from '../constants/theme'
import { DEFAULT_COLLECTION_ICON, IoniconName } from '../constants/icons'
import { Collection } from '../types'

interface MoveToCollectionModalProps {
  visible: boolean
  collections: Collection[]
  onClose: () => void
  onSelect: (collectionId: string) => void
  excludeId?: string
}

export default function MoveToCollectionModal({
  visible,
  collections,
  onClose,
  onSelect,
  excludeId,
}: MoveToCollectionModalProps) {
  const insets = useSafeAreaInsets()
  const rows = excludeId ? collections.filter(c => c.id !== excludeId) : collections

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Move to…</Text>
          <FlatList
            data={rows}
            keyExtractor={c => c.id}
            renderItem={({ item }) => (
              <TouchableOpacity
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
                <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>No collections yet. Create one first.</Text>
            }
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: COLORS.cream,
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
    backgroundColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  title: { fontSize: 18, fontFamily: FONTS.serif, color: COLORS.text, marginBottom: SPACING.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: { flex: 1, fontSize: 15, fontFamily: FONTS.sansMed, color: COLORS.text },
  empty: {
    fontSize: 14,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
    textAlign: 'center',
    paddingVertical: SPACING.xl,
  },
})

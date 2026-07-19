import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { FONTS, RADIUS, SPACING } from '../constants/theme'
import { SettingGroup, SettingRow } from '../components/Settings'
import {
  exportLatestAutoBackup,
  getAutoBackupStatus,
  restoreAutoBackup,
  type AutoBackupSnapshot,
  type AutoBackupStatus,
} from '../lib/autoBackup'
import {
  buildRestoreConfirmMessage,
  canExportLatestAutoBackup,
  canRestoreAutoBackup,
  deriveLastSavedStatus,
  formatImportResultMessage,
  formatSnapshotLabel,
  isBackupActionActive,
  isBackupBusy,
  type BackupBusyAction,
} from '../lib/backupSettingsUi'
import { getSettings, patchSettings, type Settings } from '../lib/settings'
import { exportData, importData } from '../lib/transfer'
import { useColors, useThemedStyles } from '../contexts/ThemeContext'

export default function BackupSettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useThemedStyles(c => StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.md,
      backgroundColor: c.bg,
    },
    backBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, paddingRight: SPACING.sm },
    topAction: { fontFamily: FONTS.sansSemi, fontSize: 15, color: c.accent },
    topTitle: { fontFamily: FONTS.sansBold, fontSize: 16, color: c.text },
    topSpacer: { width: 72 },
    sectionHint: {
      fontFamily: FONTS.sans,
      fontSize: 13,
      color: c.muted,
      lineHeight: 18,
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.md,
    },
    statusCard: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.lg,
      backgroundColor: c.card,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      gap: 4,
    },
    statusLabel: {
      fontFamily: FONTS.mono,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: c.muted,
    },
    statusValue: {
      fontFamily: FONTS.sansMed,
      fontSize: 14,
      color: c.text,
      lineHeight: 20,
    },
    actionRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: RADIUS.md,
      borderWidth: 1.5,
      borderColor: c.accentBorder,
      backgroundColor: c.accentSoft,
    },
    actionBtnDisabled: {
      opacity: 0.45,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    actionBtnText: {
      fontFamily: FONTS.sansSemi,
      fontSize: 14,
      color: c.accent,
    },
    actionBtnTextDisabled: {
      color: c.muted,
    },
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    backdrop: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: c.text,
      opacity: 0.35,
    },
    sheet: {
      backgroundColor: c.cream,
      borderTopLeftRadius: RADIUS.xl,
      borderTopRightRadius: RADIUS.xl,
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.sm,
      maxHeight: '70%',
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: RADIUS.sm,
      backgroundColor: c.border,
      marginBottom: SPACING.lg,
    },
    sheetTitle: { fontFamily: FONTS.serif, fontSize: 18, color: c.text, marginBottom: SPACING.sm },
    sheetHint: {
      fontFamily: FONTS.sans,
      fontSize: 13,
      color: c.muted,
      lineHeight: 18,
      marginBottom: SPACING.md,
    },
    snapshotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    snapshotText: { flex: 1, fontFamily: FONTS.sansMed, fontSize: 15, color: c.text, lineHeight: 20 },
    emptySnapshots: {
      fontFamily: FONTS.sans,
      fontSize: 14,
      color: c.muted,
      paddingVertical: SPACING.lg,
      textAlign: 'center',
    },
    closeBtn: {
      marginTop: SPACING.md,
      alignItems: 'center',
      paddingVertical: SPACING.md,
    },
    closeBtnText: { fontFamily: FONTS.sansSemi, fontSize: 15, color: c.accent },
  }))

  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<AutoBackupStatus | null>(null)
  const [snapshots, setSnapshots] = useState<AutoBackupSnapshot[]>([])
  const [busyAction, setBusyAction] = useState<BackupBusyAction>(null)
  const [pickerVisible, setPickerVisible] = useState(false)
  const mountedRef = useRef(true)
  const busyActionRef = useRef<BackupBusyAction>(null)
  const insetStyles = useMemo(() => StyleSheet.create({
    topBar: { paddingTop: insets.top + SPACING.sm },
    scrollContent: {
      paddingTop: SPACING.lg,
      paddingBottom: insets.bottom + SPACING.xl * 2,
    },
    sheet: { paddingBottom: insets.bottom + SPACING.lg },
  }), [insets.bottom, insets.top])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const alertIfMounted = useCallback((
    title: string,
    message?: string,
    buttons?: Parameters<typeof Alert.alert>[2],
  ) => {
    if (!mountedRef.current) return
    Alert.alert(title, message, buttons)
  }, [])

  const loadState = useCallback(async () => {
    const [nextSettings, nextStatus] = await Promise.all([
      getSettings(),
      getAutoBackupStatus(),
    ])
    return {
      settings: nextSettings,
      status: nextStatus,
      snapshots: nextStatus.snapshots.slice(0, 7),
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      let active = true
      void loadState()
        .then(next => {
          if (!active || !mountedRef.current) return
          setSettings(next.settings)
          setStatus(next.status)
          setSnapshots(next.snapshots)
        })
        .catch((error: unknown) => {
          if (!active || !mountedRef.current) return
          const message = error instanceof Error ? error.message : String(error)
          alertIfMounted('Could not load backups', message)
        })
      return () => {
        active = false
      }
    }, [loadState, alertIfMounted]),
  )

  const refresh = useCallback(async () => {
    try {
      const next = await loadState()
      if (!mountedRef.current) return
      setSettings(next.settings)
      setStatus(next.status)
      setSnapshots(next.snapshots)
    } catch (error: unknown) {
      if (!mountedRef.current) return
      const message = error instanceof Error ? error.message : String(error)
      alertIfMounted('Could not refresh backups', message)
    }
  }, [loadState, alertIfMounted])

  const beginAction = useCallback((action: Exclude<BackupBusyAction, null>) => {
    if (busyActionRef.current) return false
    busyActionRef.current = action
    if (mountedRef.current) setBusyAction(action)
    return true
  }, [])

  const finishAction = useCallback(() => {
    busyActionRef.current = null
    if (mountedRef.current) setBusyAction(null)
  }, [])

  const busy = isBackupBusy(busyAction)

  const actionInput = {
    available: !!status?.available,
    busy,
    snapshotCount: status?.snapshotCount ?? 0,
  }

  const isNative = Platform.OS !== 'web'

  const toggleAutoBackup = async () => {
    if (!settings || !isNative || !beginAction('toggle')) return
    try {
      const nextSettings = await patchSettings({
        autoBackupEnabled: !settings.autoBackupEnabled,
      })
      if (mountedRef.current) {
        setSettings(nextSettings)
        setStatus(current => current ? {
          ...current,
          enabled: nextSettings.autoBackupEnabled,
          due: nextSettings.autoBackupEnabled ? current.due : false,
        } : current)
      }
      const nextStatus = await getAutoBackupStatus()
      if (!mountedRef.current) return
      setSettings(nextSettings)
      setStatus(nextStatus)
      setSnapshots(nextStatus.snapshots.slice(0, 7))
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (mountedRef.current) {
        alertIfMounted('Could not update backup setting', message)
      }
      await refresh()
    } finally {
      finishAction()
    }
  }

  const handleExportLatest = async () => {
    if (!canExportLatestAutoBackup(actionInput) || !beginAction('exportLatest')) return
    try {
      const latest = await exportLatestAutoBackup()
      if (!latest) {
        alertIfMounted('Export unavailable', 'No automatic backup is available to export.')
        return
      }
      await refresh()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      alertIfMounted('Export failed', message)
    } finally {
      finishAction()
    }
  }

  const confirmRestore = (snapshot: AutoBackupSnapshot) => {
    if (busyActionRef.current) return
    Alert.alert(
      'Restore automatic backup?',
      buildRestoreConfirmMessage(snapshot),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: () => {
            void runRestore(snapshot)
          },
        },
      ],
    )
  }

  const runRestore = async (snapshot: AutoBackupSnapshot) => {
    if (!beginAction('restore')) return
    setPickerVisible(false)
    try {
      const res = await restoreAutoBackup(snapshot.id)
      if (!mountedRef.current) return
      const message = formatImportResultMessage(res)
      if (res.limited) {
        alertIfMounted('Restore complete', message, [
          { text: 'OK', style: 'cancel' },
          {
            text: 'See plans',
            onPress: () => {
              if (mountedRef.current) router.push('/upgrade')
            },
          },
        ])
      } else {
        alertIfMounted('Restore complete', message)
      }
      await refresh()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      alertIfMounted('Restore failed', message)
    } finally {
      finishAction()
    }
  }

  const handleManualExport = async () => {
    if (!beginAction('manualExport')) return
    try {
      await exportData()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      alertIfMounted('Export failed', message)
    } finally {
      finishAction()
    }
  }

  const handleManualImport = async () => {
    if (!beginAction('manualImport')) return
    try {
      const res = await importData()
      if (!res || !mountedRef.current) return
      const message = formatImportResultMessage(res)
      if (res.limited) {
        alertIfMounted('Import complete', message, [
          { text: 'OK', style: 'cancel' },
          {
            text: 'See plans',
            onPress: () => {
              if (mountedRef.current) router.push('/upgrade')
            },
          },
        ])
      } else {
        alertIfMounted('Import complete', message)
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      alertIfMounted('Import failed', message)
    } finally {
      finishAction()
    }
  }

  const restoreEnabled = canRestoreAutoBackup(actionInput)
  const exportLatestEnabled = canExportLatestAutoBackup(actionInput)
  const lastSavedText = status
    ? deriveLastSavedStatus({
        available: status.available,
        enabled: status.enabled,
        lastSavedAt: status.lastSavedAt,
        lastSavedDayKey: status.lastSavedDayKey,
        snapshotCount: status.snapshotCount,
      })
    : 'Loading backup status…'

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, insetStyles.topBar]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (!busy) router.back()
          }}
          disabled={busy}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Back to Settings"
          accessibilityState={{ disabled: busy, busy }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.accent} />
          <Text style={styles.topAction}>Settings</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Local backup</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={insetStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionHint}>
          Trove saves one private local snapshot per day when you open or return to the app, keeps the
          latest seven, and removes them if you uninstall or clear app data.
        </Text>

        <SettingGroup title="Automatic backup">
          <SettingRow
            icon="save-outline"
            label="Automatic daily local backup"
            hint={isNative ? 'Runs once per day on this device' : 'Available on iOS and Android only'}
            toggle
            on={isNative ? !!settings?.autoBackupEnabled : false}
            onPress={() => void toggleAutoBackup()}
            disabled={!isNative || !settings || busy}
            busy={isBackupActionActive(busyAction, 'toggle')}
            last
          />
        </SettingGroup>

        <View style={styles.statusCard} accessible accessibilityLabel={`Backup status: ${lastSavedText}`}>
          <Text style={styles.statusLabel}>Status</Text>
          <Text style={styles.statusValue}>{lastSavedText}</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, !restoreEnabled && styles.actionBtnDisabled]}
            onPress={() => setPickerVisible(true)}
            disabled={!restoreEnabled}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Restore auto backup"
            accessibilityState={{
              disabled: !restoreEnabled,
              busy: isBackupActionActive(busyAction, 'restore'),
            }}
          >
            {isBackupActionActive(busyAction, 'restore') ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="refresh-outline" size={18} color={restoreEnabled ? colors.accent : colors.muted} />
            )}
            <Text style={[styles.actionBtnText, !restoreEnabled && styles.actionBtnTextDisabled]}>
              Restore auto backup
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, !exportLatestEnabled && styles.actionBtnDisabled]}
            onPress={() => void handleExportLatest()}
            disabled={!exportLatestEnabled}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Export latest automatic backup"
            accessibilityState={{
              disabled: !exportLatestEnabled,
              busy: isBackupActionActive(busyAction, 'exportLatest'),
            }}
          >
            {isBackupActionActive(busyAction, 'exportLatest') ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="share-outline" size={18} color={exportLatestEnabled ? colors.accent : colors.muted} />
            )}
            <Text style={[styles.actionBtnText, !exportLatestEnabled && styles.actionBtnTextDisabled]}>
              Export latest
            </Text>
          </TouchableOpacity>
        </View>

        <SettingGroup title="Manual transfer">
          <SettingRow
            icon="cloud-upload-outline"
            label="Export data"
            hint="Create a backup file you can save or share"
            onPress={() => void handleManualExport()}
            disabled={busy}
            busy={isBackupActionActive(busyAction, 'manualExport')}
          />
          <SettingRow
            icon="cloud-download-outline"
            label="Import data"
            hint="Merge a Trove backup, ZIP, JSON, or Raindrop CSV"
            onPress={() => void handleManualImport()}
            disabled={busy}
            busy={isBackupActionActive(busyAction, 'manualImport')}
            last
          />
        </SettingGroup>
      </ScrollView>

      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!busy) setPickerVisible(false)
        }}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={() => {
              if (!busy) setPickerVisible(false)
            }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Close restore picker"
            accessibilityState={{ disabled: busy }}
          />
          <View style={[styles.sheet, insetStyles.sheet]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Choose a snapshot</Text>
            <Text style={styles.sheetHint}>
              Restoring merges items into your library and never deletes your current data.
            </Text>
            <FlatList
              data={snapshots}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.snapshotRow}
                  onPress={() => confirmRestore(item)}
                  disabled={busy}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Restore snapshot from ${formatSnapshotLabel(item)}`}
                  accessibilityState={{ disabled: busy }}
                >
                  <Ionicons name="time-outline" size={18} color={colors.accent} />
                  <Text style={styles.snapshotText}>{formatSnapshotLabel(item)}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptySnapshots}>No automatic backups available.</Text>
              }
            />
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => {
                if (!busy) setPickerVisible(false)
              }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Close"
              accessibilityState={{ disabled: busy }}
            >
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

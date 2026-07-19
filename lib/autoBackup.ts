import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import * as Crypto from 'expo-crypto'
import { Platform } from 'react-native'
import {
  createBackupArchive,
  createRestoreTargetForScope,
  mergeRestoreFromBackupUri,
  validateBackupArchive,
  type ImportResult,
} from './backupArchive'
import { hasCloud } from './entitlements'
import { getSettings } from './settings'
import { getUserId, isLoggedIn } from './session'
import {
  createAutoBackupService,
  type AutoBackupDeps,
  type AutoBackupRunResult,
  type AutoBackupSnapshot,
  type AutoBackupStatus,
} from './autoBackupService'

export type {
  AutoBackupDeps,
  AutoBackupRestoreResult,
  AutoBackupRunResult,
  AutoBackupSnapshot,
  AutoBackupStatus,
} from './autoBackupService'

export { createAutoBackupService } from './autoBackupService'

const defaultDeps = (): AutoBackupDeps => ({
  platform: Platform.OS,
  getSettings,
  isLoggedIn,
  hasCloud,
  getUserId,
  documentDirectory: FileSystem.documentDirectory ?? '',
  cacheDirectory: FileSystem.cacheDirectory ?? '',
  createBackupArchive,
  createRestoreTarget: createRestoreTargetForScope,
  mergeRestoreFromBackupUri: mergeRestoreFromBackupUri as AutoBackupDeps['mergeRestoreFromBackupUri'],
  validateBackupArchive,
  makeDirectoryAsync: FileSystem.makeDirectoryAsync,
  readDirectoryAsync: FileSystem.readDirectoryAsync,
  readAsStringAsync: FileSystem.readAsStringAsync,
  writeAsStringAsync: FileSystem.writeAsStringAsync,
  getInfoAsync: FileSystem.getInfoAsync,
  copyAsync: FileSystem.copyAsync,
  moveAsync: FileSystem.moveAsync,
  deleteAsync: FileSystem.deleteAsync,
  now: () => new Date(),
  createCacheId: () => Crypto.randomUUID(),
  shareBackup: async (uri) => {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('Sharing is unavailable on this device.')
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'application/zip',
      dialogTitle: 'Export Trove backup',
      UTI: 'public.zip-archive',
    })
  },
})

const defaultService = createAutoBackupService(defaultDeps())

export const getAutoBackupStatus = (): Promise<AutoBackupStatus> =>
  defaultService.getAutoBackupStatus()

export const runAutoBackupIfDue = (): Promise<AutoBackupRunResult> =>
  defaultService.runAutoBackupIfDue()

export const listAutoBackups = (): Promise<AutoBackupSnapshot[]> =>
  defaultService.listAutoBackups()

export const getLatestAutoBackup = (): Promise<AutoBackupSnapshot | null> =>
  defaultService.getLatestAutoBackup()

export const restoreAutoBackup = (id: string): Promise<ImportResult> =>
  defaultService.restoreAutoBackup(id)

export const exportLatestAutoBackup = (): Promise<AutoBackupSnapshot | null> =>
  defaultService.exportLatestAutoBackup()

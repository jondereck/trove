import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import * as DocumentPicker from 'expo-document-picker'
import { Platform } from 'react-native'
import {
  createBackupArchive,
  isBackupZip,
  looksLikeZip,
  mergeRestoreFromBackupUri,
  mergeRestoreFromPayload,
  type ImportResult,
} from './backupArchive'
import { importRaindropCsv, isRaindropCsv } from './raindropImport'

export type { ImportResult } from './backupArchive'

export async function exportData(): Promise<{ saves: number; collections: number }> {
  const stamp = Date.now()
  const filename = `trove-backup-${stamp}.zip`
  const zipUri = `${FileSystem.cacheDirectory}${filename}`

  try {
    const counts = await createBackupArchive(zipUri)

    if (Platform.OS === 'android') {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync()
      if (!permissions.granted) return counts

      const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        filename,
        'application/zip',
      )
      const b64 = await FileSystem.readAsStringAsync(zipUri, { encoding: 'base64' })
      await FileSystem.writeAsStringAsync(destUri, b64, { encoding: 'base64' })
    } else if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(zipUri, {
        mimeType: 'application/zip',
        dialogTitle: 'Save Trove backup',
        UTI: 'public.zip-archive',
      })
    }

    return counts
  } finally {
    FileSystem.deleteAsync(zipUri, { idempotent: true }).catch(() => {})
  }
}

export async function importData(): Promise<ImportResult | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: [
      'application/zip',
      'application/json',
      'application/octet-stream',
      'text/csv',
      'text/comma-separated-values',
      'application/csv',
      'text/plain',
    ],
    copyToCacheDirectory: true,
  })
  if (res.canceled || !res.assets?.length) return null
  const asset = res.assets[0]

  const mightBeZip = isBackupZip(
    asset.name,
    asset.mimeType,
    await looksLikeZip(asset.uri),
  )

  if (!mightBeZip) {
    const raw = await fetch(asset.uri).then(r => r.text())
    if (isRaindropCsv(raw)) {
      return importRaindropCsv(raw)
    }
    try {
      return await mergeRestoreFromPayload(JSON.parse(raw), null)
    } catch (e) {
      if (e instanceof Error && e.message.includes('No saves or collections')) throw e
      throw new Error('Unrecognized file. Use a Trove backup or a Raindrop CSV export.')
    }
  }

  return mergeRestoreFromBackupUri(asset.uri, {
    name: asset.name,
    mimeType: asset.mimeType,
  })
}

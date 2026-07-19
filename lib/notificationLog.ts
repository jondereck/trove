import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import {
  mergeNotificationEntries,
  type NotificationLogEntry,
} from './notificationLogCore'
import { getSettings } from './settings'

const STORAGE_KEY = 'trove.notification-log.v1'
const listeners = new Set<() => void>()
let mutationQueue = Promise.resolve()

function notifyListeners() {
  listeners.forEach(listener => listener())
}

function fromNotification(notification: Notifications.Notification): NotificationLogEntry {
  const { content, identifier } = notification.request
  const date = new Date(notification.date).toISOString()
  const data = content.data as { screen?: string } | undefined
  return {
    id: `${identifier}:${date}`,
    title: content.title ?? 'Trove',
    body: content.body ?? '',
    date,
    read: false,
    screen:
      data?.screen === 'inbox' || data?.screen === 'library-unread' || data?.screen === 'backup-settings'
        ? data.screen
        : undefined,
  }
}

async function readStored(): Promise<NotificationLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as NotificationLogEntry[] : []
  } catch {
    return []
  }
}

async function updateStored(
  update: (entries: NotificationLogEntry[]) => NotificationLogEntry[],
): Promise<NotificationLogEntry[]> {
  let result: NotificationLogEntry[] = []
  const operation = mutationQueue.catch(() => {}).then(async () => {
    result = update(await readStored())
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(result))
    notifyListeners()
  })
  mutationQueue = operation.then(() => {}, () => {})
  await operation
  return result
}

export async function getNotificationLog(): Promise<NotificationLogEntry[]> {
  await mutationQueue
  return readStored()
}

export async function recordNotification(
  notification: Notifications.Notification,
): Promise<NotificationLogEntry[]> {
  let entry = fromNotification(notification)
  if (entry.title === 'Trove Inbox') {
    const settings = await getSettings()
    if (settings.digestEnabled) {
      entry = { ...entry, cadence: settings.digestCadence }
    }
  }
  return updateStored(entries =>
    mergeNotificationEntries(entries, [entry]),
  )
}

export async function clearNotificationLog(): Promise<NotificationLogEntry[]> {
  return updateStored(() => [])
}

export async function syncPresentedNotifications(): Promise<NotificationLogEntry[]> {
  if (Platform.OS === 'web') return getNotificationLog()
  try {
    const presented = await Notifications.getPresentedNotificationsAsync()
    return updateStored(entries =>
      mergeNotificationEntries(entries, presented.map(fromNotification)),
    )
  } catch {
    return getNotificationLog()
  }
}

export async function markAllNotificationsRead(): Promise<NotificationLogEntry[]> {
  return updateStored(entries => entries.map(entry => ({ ...entry, read: true })))
}

export async function getUnreadNotificationCount(): Promise<number> {
  return (await getNotificationLog()).filter(entry => !entry.read).length
}

export function subscribeNotificationLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

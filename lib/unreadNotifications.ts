import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { fetchUnreadLibraryCount } from './db'
import { getSettings, type Settings } from './settings'
import {
  DIGEST_CHANNEL_ID,
  UNREAD_DIGEST_ID,
  buildUnreadDigestContent,
} from './notificationKinds'
import { decideScheduleDigest } from './notificationScheduler'
import {
  buildDigestTrigger,
  ensureDigestAndroidChannel,
  requestDigestPermissions,
} from './digestNotifications'

export async function cancelUnreadNotification() {
  if (Platform.OS === 'web') return
  try {
    await Notifications.cancelScheduledNotificationAsync(UNREAD_DIGEST_ID)
  } catch {
    // ignore — may not be scheduled
  }
}

/**
 * Cancel and reschedule the unread (unopened) digest. Shares hour/cadence
 * with the inbox digest. Skips when disabled, denied, or unread count is 0.
 */
export async function syncUnreadNotification(override?: Partial<Settings>): Promise<void> {
  if (Platform.OS === 'web') return

  const settings = { ...(await getSettings()), ...override }
  await cancelUnreadNotification()
  if (!settings.unreadDigestEnabled) return

  const count = await fetchUnreadLibraryCount()
  if (decideScheduleDigest({ enabled: true, count }) === 'skip') return

  const permitted = await requestDigestPermissions()
  if (!permitted) return

  await ensureDigestAndroidChannel()

  const content = buildUnreadDigestContent(count)
  await Notifications.scheduleNotificationAsync({
    identifier: UNREAD_DIGEST_ID,
    content: {
      title: content.title,
      body: content.body,
      data: content.data,
      ...(Platform.OS === 'android' ? { channelId: DIGEST_CHANNEL_ID } : {}),
    },
    trigger: buildDigestTrigger(settings),
  })
}

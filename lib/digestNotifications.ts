import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { fetchInboxSaves } from './db'
import { getSettings, type DigestCadence, type Settings } from './settings'
import {
  DIGEST_CHANNEL_ID,
  INBOX_DIGEST_ID,
  buildInboxDigestContent,
} from './notificationKinds'
import { decideScheduleDigest } from './notificationScheduler'

export const DIGEST_NOTIFICATION_ID = INBOX_DIGEST_ID
export { DIGEST_CHANNEL_ID }

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export async function ensureDigestAndroidChannel() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(DIGEST_CHANNEL_ID, {
    name: 'Digests',
    importance: Notifications.AndroidImportance.DEFAULT,
  })
}

export async function requestDigestPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  const current = await Notifications.getPermissionsAsync()
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true
  }
  const asked = await Notifications.requestPermissionsAsync()
  return !!(asked.granted || asked.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL)
}

export async function cancelDigestNotification() {
  if (Platform.OS === 'web') return
  try {
    await Notifications.cancelScheduledNotificationAsync(INBOX_DIGEST_ID)
  } catch {
    // ignore — may not be scheduled
  }
}

function weekdayForExpo(digestWeekday: number): number {
  // Settings: 0=Sun … 6=Sat → Expo weekly trigger: 1=Sun … 7=Sat
  return ((digestWeekday % 7) + 7) % 7 + 1
}

export function buildDigestTrigger(settings: Settings): Notifications.NotificationTriggerInput {
  const hour = Math.min(23, Math.max(0, settings.digestHour))
  if (settings.digestCadence === 'daily') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
    }
  }
  return {
    type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
    weekday: weekdayForExpo(settings.digestWeekday),
    hour,
    minute: 0,
  }
}

/**
 * Cancel and reschedule the inbox digest. Skips scheduling when disabled,
 * permission denied, or inbox count is 0.
 */
export async function syncDigestNotification(override?: Partial<Settings>): Promise<void> {
  if (Platform.OS === 'web') return

  const settings = { ...(await getSettings()), ...override }
  await cancelDigestNotification()
  if (!settings.digestEnabled) return

  const inbox = await fetchInboxSaves()
  const count = inbox.length
  if (decideScheduleDigest({ enabled: true, count }) === 'skip') return

  const permitted = await requestDigestPermissions()
  if (!permitted) return

  await ensureDigestAndroidChannel()

  const content = buildInboxDigestContent(count)
  await Notifications.scheduleNotificationAsync({
    identifier: INBOX_DIGEST_ID,
    content: {
      title: content.title,
      body: content.body,
      data: content.data,
      ...(Platform.OS === 'android' ? { channelId: DIGEST_CHANNEL_ID } : {}),
    },
    trigger: buildDigestTrigger(settings),
  })
}

export type { DigestCadence }

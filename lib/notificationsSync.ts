import { syncDigestNotification } from './digestNotifications'
import { syncUnreadNotification } from './unreadNotifications'
import type { Settings } from './settings'

export async function syncAllDigestNotifications(override?: Partial<Settings>): Promise<void> {
  await syncDigestNotification(override)
  await syncUnreadNotification(override)
}

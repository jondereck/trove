export const MAX_LOG_ENTRIES = 50

export interface NotificationLogEntry {
  id: string
  title: string
  body: string
  date: string
  read: boolean
  screen?: 'inbox'
  cadence?: 'daily' | 'weekly'
}

export function mergeNotificationEntries(
  existing: NotificationLogEntry[],
  incoming: NotificationLogEntry[],
): NotificationLogEntry[] {
  const byId = new Map(existing.map(item => [item.id, item]))
  incoming.forEach(item => {
    const previous = byId.get(item.id)
    byId.set(item.id, previous ? { ...item, read: previous.read } : item)
  })
  return [...byId.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_LOG_ENTRIES)
}

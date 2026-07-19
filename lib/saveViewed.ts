export function nextIsUnreadAfterPersist(currentUnread: boolean, persistOk: boolean): boolean {
  if (!currentUnread) return false
  return !persistOk
}

export interface DeferMarkViewedParams {
  isUnread: boolean
  saveId: string
  markViewed: (id: string) => Promise<boolean>
  runAfterInteractions: (task: () => void) => { cancel: () => void }
  onPersisted?: () => void
  isMounted?: () => boolean
}

export function deferMarkSaveViewed({
  isUnread,
  saveId,
  markViewed,
  runAfterInteractions,
  onPersisted,
  isMounted = () => true,
}: DeferMarkViewedParams): void {
  if (!isUnread) return

  runAfterInteractions(() => {
    void (async () => {
      try {
        const ok = await markViewed(saveId)
        if (ok && isMounted()) {
          onPersisted?.()
        }
      } catch {
        // Persist attempt finished; keep local unread state unchanged.
      }
    })()
  })
}

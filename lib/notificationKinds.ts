export const INBOX_DIGEST_ID = 'trove-inbox-digest'
export const UNREAD_DIGEST_ID = 'trove-unread-digest'
export const DIGEST_CHANNEL_ID = 'digests'

export function shouldScheduleCountDigest(enabled: boolean, count: number): boolean {
  return enabled && count > 0
}

export function buildInboxDigestContent(count: number) {
  const noun = count === 1 ? 'item' : 'items'
  return {
    title: 'Trove Inbox',
    body: `You have ${count} unsorted ${noun}`,
    data: { screen: 'inbox' as const },
  }
}

export function buildUnreadDigestContent(count: number) {
  const noun = count === 1 ? 'save' : 'saves'
  return {
    title: 'Unopened in Trove',
    body: `You have ${count} ${noun} you have not opened yet`,
    data: { screen: 'library-unread' as const },
  }
}

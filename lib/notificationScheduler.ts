import { shouldScheduleCountDigest } from './notificationKinds'

export function decideScheduleDigest(params: {
  enabled: boolean
  count: number
}): 'schedule' | 'skip' {
  return shouldScheduleCountDigest(params.enabled, params.count) ? 'schedule' : 'skip'
}

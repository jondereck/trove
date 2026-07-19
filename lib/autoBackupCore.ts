export const AUTO_BACKUP_RETENTION = 7
export const SNAPSHOT_PREFIX = 'trove-auto-backup-'
const MAX_DATE_TIMESTAMP_MS = 8_640_000_000_000_000

export type AutoBackupScope =
  | { kind: 'local' }
  | { kind: 'cloud'; userId: string }

export type ParsedSnapshot = {
  id: string
  dayKey: string
  timestampMs: number
}

const SNAPSHOT_RE = /^trove-auto-backup-(\d{4}-\d{2}-\d{2})-(\d+)\.zip$/

export function localCalendarDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function resolveAutoBackupScope(
  loggedIn: boolean,
  hasCloudEntitlement: boolean,
  userId: string | null,
): AutoBackupScope {
  if (loggedIn && hasCloudEntitlement && userId) {
    return { kind: 'cloud', userId }
  }
  return { kind: 'local' }
}

export function scopeNamespace(scope: AutoBackupScope): string {
  if (scope.kind === 'local') return 'local'
  let encoded = ''
  for (let index = 0; index < scope.userId.length; index++) {
    encoded += scope.userId.charCodeAt(index).toString(16).padStart(4, '0')
  }
  return `cloud-${encoded || 'empty'}`
}

export function buildSnapshotFilename(dayKey: string, timestampMs: number): string {
  return `${SNAPSHOT_PREFIX}${dayKey}-${timestampMs}.zip`
}

export function parseSnapshotFilename(filename: string): ParsedSnapshot | null {
  const match = SNAPSHOT_RE.exec(filename)
  if (!match) return null
  const [year, month, day] = match[1].split('-').map(Number)
  const timestampMs = Number(match[2])
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth[month - 1] ||
    !Number.isSafeInteger(timestampMs) ||
    timestampMs < 0 ||
    timestampMs > MAX_DATE_TIMESTAMP_MS
  ) {
    return null
  }
  return {
    id: filename,
    dayKey: match[1],
    timestampMs,
  }
}

export function sortSnapshots<T extends { timestampMs: number }>(snapshots: T[]): T[] {
  return [...snapshots].sort((a, b) => b.timestampMs - a.timestampMs)
}

export function deriveLastSavedDayKey(filenames: string[]): string | null {
  const parsed = filenames
    .map(name => parseSnapshotFilename(name))
    .filter((item): item is ParsedSnapshot => item != null)
  if (!parsed.length) return null
  return sortSnapshots(parsed)[0].dayKey
}

export function isAutoBackupDue(
  lastSavedDayKey: string | null | undefined,
  now: Date,
): boolean {
  if (!lastSavedDayKey) return true
  return lastSavedDayKey !== localCalendarDayKey(now)
}

export function chooseSnapshotsToPrune(
  filenames: string[],
  maxKeep = AUTO_BACKUP_RETENTION,
): { keep: string[]; prune: string[] } {
  const parsed = filenames
    .map(name => {
      const snap = parseSnapshotFilename(name)
      return snap ? { name, timestampMs: snap.timestampMs } : null
    })
    .filter((item): item is { name: string; timestampMs: number } => item != null)

  const sorted = sortSnapshots(parsed)
  const keep = sorted.slice(0, maxKeep).map(item => item.name)
  const prune = sorted.slice(maxKeep).map(item => item.name)
  return { keep, prune }
}

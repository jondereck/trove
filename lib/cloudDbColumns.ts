interface DbErrorLike {
  code?: string
  message?: string
}

export function bindExpectedUserId<T extends Record<string, unknown>>(
  payload: T,
  expectedUserId: string,
): T & { user_id: string } {
  return { ...payload, user_id: expectedUserId }
}

export function isMissingViewedColumn(error: DbErrorLike | null): boolean {
  return !!error?.message?.includes('is_viewed')
}

export function stripMissingOptionalColumn(
  payload: Record<string, unknown>,
  error: DbErrorLike | null,
): Record<string, unknown> | null {
  const column = isMissingViewedColumn(error)
    ? 'is_viewed'
    : error?.message?.includes('is_pinned')
      ? 'is_pinned'
      : null
  if (!column || !(column in payload)) return null

  const next = { ...payload }
  delete next[column]
  return next
}

export function dbErrorSummary(error: DbErrorLike): string {
  return [error.code, error.message].filter(Boolean).join(': ') || 'Unknown database error'
}

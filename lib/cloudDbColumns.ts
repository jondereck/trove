interface DbErrorLike {
  code?: string
  message?: string
}

export function isMissingViewedColumn(error: DbErrorLike | null): boolean {
  return !!error?.message?.includes('is_viewed')
}

export function dbErrorSummary(error: DbErrorLike): string {
  return [error.code, error.message].filter(Boolean).join(': ') || 'Unknown database error'
}

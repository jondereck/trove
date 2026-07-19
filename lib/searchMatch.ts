export function normalizeSearchTerm(term: string): string {
  return term.trim().toLowerCase()
}

export function fieldMatchesTerm(term: string, value: string | null | undefined): boolean {
  const t = normalizeSearchTerm(term)
  if (!t) return false
  return (value ?? '').toLowerCase().includes(t)
}

export function tagMatchesTerm(term: string, tags: string[] | null | undefined): boolean {
  const t = normalizeSearchTerm(term)
  if (!t) return false
  return (tags ?? []).some(tag => tag.toLowerCase().includes(t))
}

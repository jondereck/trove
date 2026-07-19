import type { Save } from '../types'

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
  return (tags ?? []).some(tag => tag.trim().toLowerCase().includes(t))
}

/** Score one save against search terms. Returns null when any term fails to match. */
export function scoreSaveAgainstTerms(save: Save, terms: string[]): number | null {
  if (!terms.length) return null

  let score = 0
  for (const w of terms) {
    let termScore = 0
    if (fieldMatchesTerm(w, save.title)) termScore += 4
    if (tagMatchesTerm(w, save.tags)) termScore += 3
    if (fieldMatchesTerm(w, save.description)) termScore += 2
    if (fieldMatchesTerm(w, save.content)) termScore += 2
    if (fieldMatchesTerm(w, save.url)) termScore += 1
    if (termScore === 0) return null
    score += termScore
  }
  return score
}

/** Rank saves by search relevance (title > tags > description/content > url), newest on ties. */
export function rankSavesByTerms(saves: Save[], terms: string[]): Save[] {
  if (!terms.length) return []

  const scored: { save: Save; score: number }[] = []
  for (const save of saves) {
    const score = scoreSaveAgainstTerms(save, terms)
    if (score == null) continue
    scored.push({ save, score })
  }

  return scored
    .sort((a, b) =>
      b.score - a.score || b.save.created_at.localeCompare(a.save.created_at),
    )
    .slice(0, 50)
    .map(x => x.save)
}

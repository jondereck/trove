export function partitionPinned<T extends { is_pinned?: boolean | null }>(
  items: readonly T[]
): { pinned: T[]; unpinned: T[] } {
  const pinned: T[] = []
  const unpinned: T[] = []

  for (const item of items) {
    if (item.is_pinned === true) pinned.push(item)
    else unpinned.push(item)
  }

  return { pinned, unpinned }
}

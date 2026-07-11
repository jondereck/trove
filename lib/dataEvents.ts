export type DataChange = 'saves' | 'collections'

type Listener = (change: DataChange) => void

const listeners = new Set<Listener>()

export function emitDataChange(change: DataChange): void {
  listeners.forEach(listener => listener(change))
}

export function subscribeDataChanges(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

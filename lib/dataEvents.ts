export type DataChange = 'saves' | 'collections' | 'viewed'

export type ViewedChange = { id: string; is_viewed: boolean }

type Listener = (change: DataChange, payload?: ViewedChange) => void

const listeners = new Set<Listener>()

export function emitDataChange(change: DataChange): void {
  listeners.forEach(listener => listener(change))
}

export function emitViewedChange(payload: ViewedChange): void {
  listeners.forEach(listener => listener('viewed', payload))
}

export function subscribeDataChanges(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

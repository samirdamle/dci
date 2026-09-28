type Listener<T> = (event: T) => void;

/** Minimal typed event emitter. */
export interface Emitter<Events extends object> {
  on<K extends keyof Events>(type: K, fn: Listener<Events[K]>): () => void;
  emit<K extends keyof Events>(type: K, event: Events[K]): void;
  /** Remove every listener. */
  clear(): void;
}

export function createEmitter<Events extends object>(): Emitter<Events> {
  const listeners = new Map<keyof Events, Set<Listener<never>>>();
  return {
    on(type, fn) {
      let set = listeners.get(type);
      if (!set) listeners.set(type, (set = new Set()));
      set.add(fn as Listener<never>);
      return () => set.delete(fn as Listener<never>);
    },
    emit(type, event) {
      const set = listeners.get(type);
      if (!set) return;
      for (const fn of [...set]) (fn as Listener<typeof event>)(event);
    },
    clear: () => listeners.clear(),
  };
}

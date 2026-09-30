import { useSyncExternalStore } from "react";

/**
 * Store mínima (sem dependências) para estado de BAIXA frequência da UI.
 * Dados de alta frequência (currentTime de áudio/vídeo) ficam nos controladores.
 */
export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  reset(): void;
  subscribe(fn: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === "function" ? patch(state) : patch;
      let changed = false;
      for (const k in p) {
        if (!Object.is(p[k], state[k])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...p };
      subs.forEach((fn) => fn());
    },
    reset() {
      state = initial;
      subs.forEach((fn) => fn());
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export function useStore<T extends object, S>(store: Store<T>, selector: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()), () => selector(store.get()));
}

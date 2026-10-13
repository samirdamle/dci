import { useSyncExternalStore } from 'react';

/** `primary`: the main input is a finger. `any`: some input is (e.g. a touch laptop). */
export type PointerScope = 'primary' | 'any';

const QUERIES: Record<PointerScope, string> = {
  primary: '(pointer: coarse)',
  any: '(any-pointer: coarse)',
};

const media = (scope: PointerScope) =>
  typeof window === 'undefined' || !window.matchMedia ? null : window.matchMedia(QUERIES[scope]);

/** Whether the device has a touch screen, live as inputs come and go. */
export function useCoarsePointer(scope: PointerScope = 'primary'): boolean {
  return useSyncExternalStore(
    (fn) => {
      const mql = media(scope);
      mql?.addEventListener('change', fn);
      return () => mql?.removeEventListener('change', fn);
    },
    () => media(scope)?.matches ?? false,
    () => false,
  );
}

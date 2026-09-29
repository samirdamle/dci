import { createDci, type DciConfig, type DciInstance } from '@dci/core';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

const DciContext = createContext<DciInstance | null>(null);

export interface DciProviderProps {
  /**
   * Passed to `createDci()`. Later changes are applied with `dci.update()`;
   * only a new `endpoint` or `transport` recreates the instance. Keep it
   * stable (module scope or `useMemo`) so unchanged renders do no work.
   */
  config: DciConfig;
  /**
   * Scope DCI to an element rendered inside the provider (overrides
   * `config.root`); the ref is read when the instance is created.
   */
  root?: RefObject<Element | null>;
  children?: ReactNode;
}

/**
 * Creates the DCI instance in an effect, so it is SSR safe (nothing runs on
 * the server) and StrictMode safe (the double mount destroys the first).
 */
export function DciProvider({ config, root, children }: DciProviderProps) {
  const [dci, setDci] = useState<DciInstance | null>(null);
  const latest = useRef(config);
  // Declared first, so the create effect below always sees the current config.
  useEffect(() => {
    latest.current = config;
  });

  useEffect(() => {
    const scope = root?.current;
    const instance = createDci(scope ? { ...latest.current, root: scope } : latest.current);
    setDci(instance);
    return () => {
      instance.destroy();
      setDci(null);
    };
  }, [config.endpoint, config.transport, root]);

  // Apply config changes in place. `update` diffs, so an unchanged config is a no-op.
  useEffect(() => {
    const scope = root?.current;
    dci?.update(scope ? { ...config, root: scope } : config);
  }, [dci, config, root]);

  return <DciContext.Provider value={dci}>{children}</DciContext.Provider>;
}

/** The DCI instance, or `null` before it mounts (and during SSR). */
export function useDci(): DciInstance | null {
  return useContext(DciContext);
}

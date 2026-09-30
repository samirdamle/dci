import { defaultClientConditions, defaultServerConditions } from 'vite';

/**
 * Resolve `@samirdamle/dci-*` workspace packages to their TypeScript sources (via the
 * `@dci/source` export condition) so tests never depend on a prior build.
 */
const conditions = ['@dci/source'];

export const sharedResolve = {
  resolve: { conditions: [...conditions, ...defaultClientConditions] },
  ssr: { resolve: { conditions: [...conditions, ...defaultServerConditions] } },
};

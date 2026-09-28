import { defineConfig, type Options } from 'tsup';

/** Shared tsup setup for every `@dci/*` library: ESM + CJS + `.d.ts`. */
export function defineLibConfig(overrides: Options = {}) {
  return defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    // tsup's dts bundler injects `baseUrl`, which TypeScript 6 flags as deprecated.
    dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
    sourcemap: true,
    clean: true,
    treeshake: true,
    ...overrides,
  });
}

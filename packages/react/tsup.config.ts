import { defineLibConfig } from '../../tsup.shared.ts';

// Hooks and context need a client component boundary in React Server Components
// (Next.js App Router). Rollup's tree-shaking pass would strip the directive, and
// esbuild alone is enough for this small package.
export default defineLibConfig({ banner: { js: '"use client";' }, treeshake: false });

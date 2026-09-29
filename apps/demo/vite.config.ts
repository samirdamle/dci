import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  // Public path the app is served from; GitHub Pages serves it under /<repo>/.
  base: process.env.DEMO_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  // A demo app: Recharts, Radix and the CRM data make one ~1 MB bundle, which is fine here.
  build: { chunkSizeWarningLimit: 1500 },
  // The demo backend (server/index.ts); without it the app falls back to an in-browser mock.
  server: { proxy: { '/api': `http://localhost:${process.env.DCI_DEMO_PORT ?? 8787}` } },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    // Consume workspace `@dci/*` packages from source for instant HMR.
    conditions: ['@dci/source', ...defaultClientConditions],
  },
});

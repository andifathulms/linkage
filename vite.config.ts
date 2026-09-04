/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path for GitHub Pages project sites; override with VITE_BASE.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/linkage/',
  plugins: [react()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    reportCompressedSize: true,
    // Vite's module-preload polyfill calls fetch(). The app makes no network requests at
    // runtime (PRD §6.5) and the bundle grep enforces that, so the polyfill goes. The
    // build targets browsers with native modulepreload.
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // React is isolated into its own chunk so the bundle grep can hold app code to
        // the full forbidden-API list. React's synthetic event table names
        // `clipboardData`; the app registers no paste handler, and separating the chunks
        // is what lets the test assert that rather than assume it.
        manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});

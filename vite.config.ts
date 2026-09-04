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
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

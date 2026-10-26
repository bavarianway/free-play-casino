/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build --mode single` inlines all JS/CSS into one self-contained HTML file (see scripts/build-single.mjs).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  // Conservative target so older iOS/Android WebViews (wallet in-app browsers) can run the bundle.
  build: {
    target: ['es2019', 'safari13', 'chrome80'],
    ...(mode === 'single' ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000, cssCodeSplit: false } : {}),
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));

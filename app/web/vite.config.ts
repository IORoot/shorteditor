/// <reference types="vitest/config" />
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The repo lives on a network drive, so Vite's cache stays on the local disk.
const localCache = path.join(os.homedir(), '.cache', 'ldnpk-video-editor');

export default defineConfig({
  cacheDir: path.join(localCache, 'vite'),
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://localhost:8000' } },
  test: {
    globals: false,
    // Essential tests run by default. Tests tagged `full` run only with `npm run test:full`.
    tags: [{ name: 'full', description: 'extended suite, run only on request' }],
    fsModuleCache: true,
    fsModuleCachePath: path.join(localCache, 'vitest'),
    // A browser was being started for every file, which was most of the suite's time.
    // Logic tests need no browser. Screen tests share one browser per worker.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/shared/test/setup.ts'],
        },
      },
    ],
  },
});

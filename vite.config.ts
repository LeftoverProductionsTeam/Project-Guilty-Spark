import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(() => {
  if (!process.env.SPARK_GENERATED_ROOT || !process.env.SPARK_FRONTEND_DIST || !process.env.SPARK_VITE_CACHE)
    throw new Error('Use scripts/build-web.mjs or scripts/run-vite.mjs so generated output is owned and disposable.');
  return {
  plugins: [react()],
  cacheDir: process.env.SPARK_VITE_CACHE,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: [
        '**/src-tauri/**',
        '**/target/**',
        '**/.toolchain/**',
        '**/.local/**',
        '**/artifacts/**',
        '**/tools/**',
        '**/preserved/**',
        '**/.research/**',
        '**/Pyros Zombie Apocolypse Mod Versions/**',
        '**/SAMPLE CODE/**',
      ],
    },
  },
  clearScreen: false,
  build: { target: 'es2022', outDir: process.env.SPARK_FRONTEND_DIST, emptyOutDir: true },
  };
});

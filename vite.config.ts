import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: [
        '**/src-tauri/**',
        '**/target/**',
        '**/.toolchain/**',
        '**/.local/**',
        '**/.research/**',
        '**/Pyros Zombie Apocolypse Mod Versions/**',
        '**/SAMPLE CODE/**',
      ],
    },
  },
  clearScreen: false,
  build: { target: 'es2022' },
});

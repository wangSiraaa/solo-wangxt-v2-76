import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
    fs: { allow: ['..'] }, // 允许引用 ../shared
  },
  build: { outDir: 'dist', emptyOutDir: true },
});

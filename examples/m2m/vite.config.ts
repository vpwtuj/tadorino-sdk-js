import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'frontend', envDir: false, plugins: [react()],
  server: { host: '127.0.0.1', port: 5174, strictPort: true, allowedHosts: ['127.0.0.1'],
    proxy: { '^/api/': { target: 'http://127.0.0.1:5181', changeOrigin: true } } },
  build: { outDir: '../dist', emptyOutDir: true },
});

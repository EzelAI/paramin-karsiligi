import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // GitHub Pages sürümü (vite build --mode static) depo adının altındaki bir yoldan yayınlanır
  base: mode === 'static' ? './' : '/',
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
}));

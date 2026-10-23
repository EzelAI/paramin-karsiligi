import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Derlenmiş sayfaya güvenlik politikası (CSP) ekler: yalnızca sitenin kendi dosyaları yüklenir, dışarıya istek
 * yapılamaz. GitHub Pages başlık ayarlamaya izin vermediği için meta etiketiyle. Geliştirme sunucusu satır içi
 * betik kullandığı için yalnızca derlemede uygulanır.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Grafik kütüphanesi satır içi stil kullanır
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
  };
}

/** GitHub Pages sürümü arama motorlarında listelenmesin (yalnızca bağlantıyı bilenler kullansın) */
function noIndex(mode: string): Plugin {
  return {
    name: 'no-index',
    apply: 'build',
    transformIndexHtml: () =>
      mode === 'static' ? [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow, noarchive' }, injectTo: 'head' }] : [],
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), contentSecurityPolicy(), noIndex(mode)],
  // GitHub Pages sürümü (vite build --mode static) depo adının altındaki bir yoldan yayınlanır
  base: mode === 'static' ? './' : '/',
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
}));

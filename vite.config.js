import { defineConfig, loadEnv } from "vite";
import process from 'node:process';
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  if (mode === 'production') {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
    let url;
    try { url = new URL(env.VITE_SUPABASE_URL); } catch { /* URL inválida */ }
    if (url?.protocol !== 'https:' || !key || key.startsWith('sb_secret_')) {
      throw new Error('Configurá VITE_SUPABASE_URL (HTTPS) y VITE_SUPABASE_PUBLISHABLE_KEY pública en Vercel.');
    }
  }
  return {
    plugins: [react(), tailwindcss(), VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        id: '/', name: 'El Morena · Libreta de ventas', short_name: 'El Morena',
        description: 'Menú, pedidos, cobros y stock de El Morena.',
        lang: 'es-AR', start_url: '/', scope: '/', display: 'standalone',
        background_color: '#eaf1e4', theme_color: '#557c55',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/catalogo-elmorena/**'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    })],
  };
});

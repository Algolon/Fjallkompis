import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// NOTE: `base` is set to './' so the build works on GitHub Pages project
// subpaths (e.g. https://user.github.io/fjallkompis/) AND on Netlify root.
// If you deploy to a custom GitHub Pages path, relative asset URLs keep working.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'Fjällkompis — Kungsleden trail companion',
        short_name: 'Fjällkompis',
        description:
          'Offline-first hut-to-hut trail companion for the Kungsleden. Prototype — not for primary navigation.',
        lang: 'en',
        theme_color: '#2f4a3e',
        background_color: '#e9edeb',
        display: 'standalone',
        orientation: 'portrait',
        // Relative scope/start_url to match base: './'
        scope: './',
        start_url: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the built app shell + assets so the app works fully
        // offline after the first successful load.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // Let you test PWA/offline behaviour in `npm run dev`.
        enabled: false,
      },
    }),
  ],
});

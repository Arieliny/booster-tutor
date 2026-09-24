import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable + offline. The point is the Set review tab at a prerelease,
    // where the venue wifi is usually unusable: the app shell and all card data
    // are precached, and card images are cached on demand (see lib/offline.ts,
    // which can pre-warm the whole set in one go while you're still on wifi).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Booster Tutor',
        short_name: 'Booster Tutor',
        description: 'MTG cube pack simulator, rotisserie drafting and set review',
        theme_color: '#0b0d12',
        background_color: '#0b0d12',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The set-review data ships as a JS chunk, so it precaches with the rest.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Never hand the SPA shell back for an API call.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cards\.scryfall\.io\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'scryfall-images',
              expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})

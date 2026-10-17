import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// Local only: /api goes to scripts/dev-api.ts (in-memory Redis). Vercel serves
// the built app itself and never uses this. If the dev API isn't running, API
// calls simply fail, which the app already treats as "offline".
const devApi = { '/api': { target: 'http://localhost:5186', changeOrigin: false } }

export default defineConfig({
  server: { proxy: devApi },
  preview: { proxy: devApi },
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
        description: 'Magic cube tools, rules judge, set grades and a life counter',
        theme_color: '#0b0d12',
        background_color: '#0b0d12',
        // Installed, the app runs full screen (no status bar), so the life counter needs no
        // browser full screen and Chrome shows no "to exit full screen" banner.
        display: 'fullscreen',
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
        // The cube review data chunk is ~750 KB; keep headroom over Workbox's 2 MB default.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Never hand the SPA shell back for an API call.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cards\.scryfall\.io\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'scryfall-images',
              // Set review (~200) + cube review (~1,100 small, ~1,100 normal) with room
              // to grow. At 800 the cube images evicted each other and the set review's.
              expiration: { maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 120 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})

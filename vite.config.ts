import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// Local only: /api goes to scripts/dev-api.ts (in-memory Redis). Vercel serves
// the built app itself and never uses this. If the dev API isn't running, API
// calls simply fail, which the app already treats as "offline".
const devApi = { '/api': { target: 'http://localhost:5186', changeOrigin: false } }

// The installable app's identity, per flavor (src/lib/app-flavor.ts): Booster Tutor,
// or LifeTutor when VITE_APP=table (the LifeTutor Vercel project sets it; locally
// `vite --mode table` reads .env.table).
const manifests = {
  booster: {
    name: 'Booster Tutor',
    short_name: 'Booster Tutor',
    description: 'Magic cube tools, rules judge, set grades and a life counter',
    apple: 'apple-touch-icon.png',
    icon192: '/icon-192.png',
    icon512: '/icon-512.png',
    maskable: '/icon-512.png',
  },
  table: {
    name: 'LifeTutor',
    short_name: 'LifeTutor',
    description: 'A life counter for Magic, with a rules judge and card search',
    apple: 'lifetutor-apple-touch-icon.png',
    icon192: '/lifetutor-192.png',
    icon512: '/lifetutor-512.png',
    maskable: '/lifetutor-maskable-512.png',
  },
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const app = manifests[env.VITE_APP === 'table' ? 'table' : 'booster']
  return {
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
      includeAssets: [app.apple],
      manifest: {
        name: app.name,
        short_name: app.short_name,
        description: app.description,
        theme_color: '#0b0d12',
        background_color: '#0b0d12',
        // Installed, the app runs full screen (no status bar), so the life counter needs no
        // browser full screen and Chrome shows no "to exit full screen" banner.
        display: 'fullscreen',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: app.icon192, sizes: '192x192', type: 'image/png' },
          { src: app.icon512, sizes: '512x512', type: 'image/png' },
          {
            src: app.maskable,
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
  }
})

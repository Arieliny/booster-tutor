import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { startUpdates } from './lib/sw-update'

/**
 * Recover from a stale build after a deploy.
 *
 * Asset filenames are content-hashed, so a tab still running the previous build
 * (or one served from the old service-worker precache) can try to lazy-load a
 * chunk that no longer exists. That 404s, the dynamic import rejects, and the
 * app blanks out. Reloading picks up the new index.html and its assets.
 *
 * Guarded by a timestamp so a genuinely missing chunk can't cause a reload loop.
 */
const RELOAD_KEY = 'bt-preload-reload-at'
const RELOAD_COOLDOWN_MS = 15_000

window.addEventListener('vite:preloadError', (event) => {
  let last = 0
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
  } catch {
    // Private mode / blocked storage: fall through and allow one reload.
  }
  if (Date.now() - last < RELOAD_COOLDOWN_MS) return

  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // Ignore - worst case we reload again after the cooldown.
  }
  event.preventDefault()
  window.location.reload()
})

/**
 * New deploys wait for the person (lib/sw-update.ts): a banner offers Update,
 * and only that reloads. Until 2026-11-16 the page reloaded itself the moment a
 * new service worker took over, which could land mid game.
 */
startUpdates()

// One build, two apps (lib/app-flavor.ts). Each loads only its own root; the
// flavor is a build-time constant, so the other branch is dropped from the bundle.
const root = createRoot(document.getElementById('root')!)
// Checked inline (not via app-flavor) so the build can see it and drop the other app.
if (import.meta.env.VITE_APP === 'table') {
  void import('./TableApp.tsx').then(({ TableApp }) =>
    root.render(
      <StrictMode>
        <TableApp />
      </StrictMode>,
    ),
  )
} else {
  void import('./BoosterTutor.tsx').then(({ BoosterTutor }) =>
    root.render(
      <StrictMode>
        <BoosterTutor />
      </StrictMode>,
    ),
  )
}

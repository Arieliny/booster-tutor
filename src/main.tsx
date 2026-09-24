import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

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
 * Pick up a new deploy without a manual refresh.
 *
 * The service worker uses skipWaiting + clientsClaim, so a new build activates
 * and claims open tabs immediately — but claiming a page does NOT reload it.
 * The tab keeps running whatever assets the old worker served, which is how a
 * deep link like /set-review could land on a build that predates routing and
 * quietly show the default tab instead.
 *
 * `controllerchange` fires when the new worker takes over, so reload then. It
 * also fires on a first-ever install, where the page was never controlled and
 * its assets are already current — hence the hadController guard, which is
 * what stops this reloading every first visit.
 */
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    window.location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

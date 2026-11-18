/*
 * The update gate (Ari, 2026-11-18: "I only want it to update when I tap the Update button").
 *
 * Loaded at the top of the generated service worker (vite.config.ts, workbox.importScripts).
 * Browsers install a new service worker on their own whenever they see a new deploy, and a
 * waiting one takes over by itself once every window of the app is closed, so the app would
 * open on the new version without anyone tapping Update. This stops that: a new version
 * refuses to install unless the page approved it in the last 10 minutes (lib/sw-update.ts
 * writes the approval when Update is tapped). The page learns about new versions from
 * /version.json instead, and shows the banner.
 *
 * Allowed without approval:
 *  - the very first install (nothing to keep);
 *  - replacing a worker from before this gate existed (it has no "gate on" marker): those
 *    pages can't write an approval, so the first gated version installs and waits as before.
 */
const APPROVAL_CACHE = "update-approval";
const GATE_CACHE = "update-gate";
const APPROVAL_TTL_MS = 10 * 60 * 1000;

self.addEventListener("install", (event) => {
  if (!self.registration.active) return;
  event.waitUntil(
    (async () => {
      const gateOn = await (await caches.open(GATE_CACHE)).match("/on");
      if (!gateOn) return;
      const approval = await (await caches.open(APPROVAL_CACHE)).match("/approved");
      const at = approval ? Number(await approval.text()) : 0;
      if (!(Date.now() - at < APPROVAL_TTL_MS)) {
        throw new Error("A new version is ready; it installs when Update is tapped.");
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await caches.delete(APPROVAL_CACHE);
      await (await caches.open(GATE_CACHE)).put("/on", new Response("1"));
    })(),
  );
});

/**
 * Offline card images.
 *
 * The service worker (configured in vite.config.ts) precaches the app shell and
 * all card *data*, so the set-review table already works with no connection.
 * Card *images* are a different matter: they come from Scryfall's CDN and are
 * only cached once you've actually looked at them, which is no use at a
 * prerelease where the wifi is bad.
 *
 * So this warms the same cache the service worker reads from, letting you pull
 * the whole set down deliberately while you still have a good connection. We
 * write to the cache directly rather than relying on the SW intercepting our
 * fetches, so it also works on a first visit before the SW has taken control.
 */

/** Must match the runtimeCaching cacheName in vite.config.ts. */
const IMAGE_CACHE = "scryfall-images";

/** Rough average of a Scryfall "normal" jpeg, for a pre-download estimate. */
const AVG_IMAGE_BYTES = 130 * 1024;

const CONCURRENCY = 6;

export function cachesSupported(): boolean {
  return typeof caches !== "undefined";
}

export function estimateBytes(count: number): number {
  return count * AVG_IMAGE_BYTES;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** How many of these URLs are already in the image cache. */
export async function countCached(urls: string[]): Promise<number> {
  if (!cachesSupported()) return 0;
  try {
    const cache = await caches.open(IMAGE_CACHE);
    const present = await Promise.all(
      urls.map((u) => cache.match(u).then((r) => (r ? 1 : 0))),
    );
    return present.reduce<number>((a, b) => a + b, 0);
  } catch {
    return 0;
  }
}

export interface WarmProgress {
  done: number;
  total: number;
  bytes: number;
  failed: number;
}

/**
 * Download every image that isn't cached yet. Resolves with the final tally;
 * aborting via `signal` leaves whatever was already stored in place.
 */
export async function warmImageCache(
  urls: string[],
  options: {
    onProgress?: (p: WarmProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<WarmProgress> {
  const progress: WarmProgress = { done: 0, total: urls.length, bytes: 0, failed: 0 };
  if (!cachesSupported()) return progress;

  const cache = await caches.open(IMAGE_CACHE);
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      if (options.signal?.aborted) return;
      const i = cursor++;
      if (i >= urls.length) return;
      const url = urls[i];
      try {
        // Skip anything already stored so a re-run is cheap.
        const hit = await cache.match(url);
        if (!hit) {
          const res = await fetch(url, { signal: options.signal });
          if (res.ok) {
            const body = await res.clone().blob();
            progress.bytes += body.size;
            await cache.put(url, res);
          } else {
            progress.failed++;
          }
        }
      } catch {
        if (options.signal?.aborted) return;
        progress.failed++;
      }
      progress.done++;
      options.onProgress?.({ ...progress });
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker),
  );
  return progress;
}

/** Drop every cached card image. */
export async function clearImageCache(): Promise<void> {
  if (!cachesSupported()) return;
  try {
    await caches.delete(IMAGE_CACHE);
  } catch {
    // Nothing useful to do if the browser refuses.
  }
}

/**
 * The lines of a downloaded file (gzipped or not), read as it streams in.
 *
 * Errors are passed along on purpose: Readable.pipe() does NOT forward an error
 * from the download to the gunzip stream, so a dropped connection mid-download
 * (Vercel, 2026-11-16: "read ECONNRESET" from Scryfall) became an unhandled
 * 'error' event that killed the build, skipping every try/catch and --soft.
 * Forwarded, it rejects the caller's `for await` like any other failure.
 */
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";

/** @param {Response} res a fetch response with a body  @param {string} url where it came from (".gz" = gzipped) */
export function downloadLines(res, url) {
  const src = Readable.fromWeb(/** @type {any} */ (res.body));
  let input = src;
  if (url.endsWith(".gz")) {
    const gunzip = createGunzip();
    src.on("error", (err) => gunzip.destroy(err));
    input = src.pipe(gunzip);
  }
  return createInterface({ input, crlfDelay: Infinity });
}

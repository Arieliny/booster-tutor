import { vi } from "vitest";

/** Minimal in-memory localStorage. */
export class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

/**
 * Give the node test environment just enough browser: localStorage, a window
 * that can dispatch/listen to events, document and navigator. Returns the
 * storage so tests can seed and inspect it. Call before importing modules
 * that touch these at load time (after vi.resetModules()).
 */
export function installBrowserStubs() {
  const storage = new MemoryStorage();
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("navigator", { onLine: true });
  return { storage, win, doc };
}

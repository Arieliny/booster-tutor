import { beforeEach, describe, expect, it, vi } from "vitest";
import { installBrowserStubs } from "./helpers/browser-stubs";

type M = typeof import("../src/lib/install");
let m: M;

beforeEach(async () => {
  vi.resetModules();
  installBrowserStubs();
  m = await import("../src/lib/install");
});

describe("install card dismissal", () => {
  it("hides for 30 days, then comes back", () => {
    const now = 1_000_000_000_000;
    expect(m.isDismissedAt(null, now)).toBe(false);
    expect(m.isDismissedAt(String(now - 29 * 86_400_000), now)).toBe(true);
    expect(m.isDismissedAt(String(now - 31 * 86_400_000), now)).toBe(false);
  });

  it("ignores junk and future timestamps", () => {
    expect(m.isDismissedAt("soon", 5)).toBe(false);
    expect(m.isDismissedAt("999999999999999", 5)).toBe(false);
  });

  it("remembers Not now in storage", () => {
    m.dismissInstall();
    expect(localStorage.getItem("booster-tutor-install-dismissed-v1")).toMatch(/^\d+$/);
  });

  it("offers nothing to install until the browser sends its prompt, and only once", async () => {
    expect(await m.promptInstall()).toBe("unavailable");
    const ev = Object.assign(new Event("beforeinstallprompt"), {
      prompt: vi.fn(async () => {}),
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    window.dispatchEvent(ev);
    expect(await m.promptInstall()).toBe("accepted");
    expect(await m.promptInstall()).toBe("unavailable");
  });
});

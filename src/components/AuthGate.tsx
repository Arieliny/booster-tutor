import { useEffect, useState, type ReactNode } from "react";
import { AuthError, checkAuth, ownerSignIn, redeemLink, signOut, tokenFromLink, type Me } from "../lib/auth";
import { AuthContext } from "../lib/auth-context";

type Gate =
  | { kind: "checking" }
  | { kind: "in"; me: Me; offline: boolean }
  | { kind: "out"; message?: string };

/** A sign-in link the page was opened with (/join#<token>), taken off the URL. */
function takeLinkToken(): string | null {
  if (location.pathname.replace(/\/+$/, "") !== "/join") return null;
  const token = tokenFromLink(location.hash);
  // Tidy the address bar either way; the token must not linger in history.
  history.replaceState(null, "", "/");
  return token;
}

/**
 * The startup decision, made once per page load and shared - React's dev-mode
 * double effects (or any remount) must never redeem a one-time link twice.
 */
let decision: Promise<Gate> | null = null;

async function decide(): Promise<Gate> {
  const linkToken = takeLinkToken();
  if (linkToken) {
    try {
      return { kind: "in", me: await redeemLink(linkToken), offline: false };
    } catch (err) {
      // A used/expired link shouldn't hide an existing session on this device.
      const now = await checkAuth();
      if (now.kind === "signedIn") return { kind: "in", me: now.me, offline: now.offline };
      return { kind: "out", message: err instanceof Error ? err.message : String(err) };
    }
  }
  const res = await checkAuth();
  return res.kind === "signedIn" ? { kind: "in", me: res.me, offline: res.offline } : { kind: "out" };
}

/**
 * Nothing renders until we know who's here. Signed out -> the sign-in screen.
 * A /join link signs in on the spot. With no signal, the cached profile lets
 * the app open (see lib/auth.ts).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>({ kind: "checking" });

  useEffect(() => {
    let live = true;
    void (decision ??= decide()).then((g) => {
      if (live) setGate(g);
    });
    return () => {
      live = false;
    };
  }, []);

  if (gate.kind === "checking") {
    return <div className="flex min-h-screen items-center justify-center text-(--color-text-dim)">Loading…</div>;
  }
  if (gate.kind === "out") {
    return <SignIn message={gate.message} onSignedIn={(me) => setGate({ kind: "in", me, offline: false })} />;
  }
  return (
    <AuthContext.Provider
      value={{
        me: gate.me,
        offline: gate.offline,
        signOut: async () => {
          await signOut();
          setGate({ kind: "out" });
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function SignIn({ message, onSignedIn }: { message?: string; onSignedIn: (me: Me) => void }) {
  const [link, setLink] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(message ?? null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<Me>) => {
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await fn());
    } catch (err) {
      setError(err instanceof AuthError || err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submitLink = () => {
    const token = tokenFromLink(link);
    if (!token) {
      setError("That doesn't look like a sign-in link. Paste the whole link you were sent.");
      return;
    }
    void run(() => redeemLink(token));
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-(--color-border) bg-(--color-bg-elev) p-6">
        <div className="text-center">
          <div className="text-2xl font-semibold text-(--color-text)">Booster Tutor</div>
          <p className="mt-1 text-sm text-(--color-text-dim)">This app is invite-only.</p>
        </div>

        <p className="rounded-lg bg-(--color-bg) p-3 text-sm text-(--color-text-dim)">
          Ari sends you a personal sign-in link. Open it on this device and you'll stay signed in.
        </p>

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitLink();
          }}
        >
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Or paste your link here"
            autoComplete="off"
            className="w-full rounded border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) placeholder:text-(--color-text-dim)"
          />
          <button
            type="submit"
            disabled={busy || !link.trim()}
            className="w-full rounded-lg bg-(--color-accent) py-2.5 text-sm font-medium text-black hover:bg-(--color-accent-bright) disabled:opacity-50"
          >
            {busy && !pinOpen ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {error && <p className="text-sm text-amber-300">{error}</p>}

        <div className="border-t border-(--color-border) pt-3">
          {!pinOpen ? (
            <button
              type="button"
              onClick={() => setPinOpen(true)}
              className="text-xs text-(--color-text-dim) hover:text-(--color-text)"
            >
              Owner? Sign in with your PIN
            </button>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (pin) void run(() => ownerSignIn(pin));
              }}
            >
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                type="password"
                autoComplete="current-password"
                placeholder="Owner PIN"
                className="min-w-0 flex-1 rounded border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) placeholder:text-(--color-text-dim)"
              />
              <button
                type="submit"
                disabled={busy || !pin}
                className="rounded border border-(--color-border) px-3 py-2 text-sm text-(--color-text) hover:bg-white/5 disabled:opacity-50"
              >
                {busy && pinOpen ? "…" : "Sign in"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-[11px] text-(--color-text-dim)">
          Booster Tutor is unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy.
        </p>
      </div>
    </div>
  );
}

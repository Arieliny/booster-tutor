import { useEffect, useState, type ReactNode } from "react";
import { checkAuth, redeemLink, signOut, takeLinkToken, type Me } from "../lib/auth";
import { AuthContext } from "../lib/auth-context";
import { SignIn } from "./SignIn";

type Gate =
  | { kind: "checking" }
  | { kind: "in"; me: Me; offline: boolean }
  | { kind: "out"; message?: string };

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

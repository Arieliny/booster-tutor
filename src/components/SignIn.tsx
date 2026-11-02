import { useState } from "react";
import { AuthError, ownerSignIn, redeemLink, tokenFromLink, type Me } from "../lib/auth";

/**
 * The two ways in: paste the personal link Ari sent, or the owner's PIN.
 * Just the controls, so a screen (Booster Tutor's gate) or a section
 * (LifeTutor's settings) can put them where they fit.
 */
export function SignInForm({ message, onSignedIn }: { message?: string; onSignedIn: (me: Me) => void }) {
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
    <div className="space-y-3">
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
          placeholder="Paste your link here"
          autoComplete="off"
          className="w-full rounded border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) placeholder:text-(--color-text-dim)"
        />
        <button
          type="submit"
          disabled={busy || !link.trim()}
          className="w-full rounded-lg bg-(--color-accent) py-2.5 text-sm font-medium text-(--color-accent-ink) hover:bg-(--color-accent-bright) disabled:opacity-50"
        >
          {busy && !pinOpen ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {error && <p className="text-sm text-amber-300">{error}</p>}

      <div className="border-t border-(--color-border) pt-3">
        {!pinOpen ? (
          <button type="button" onClick={() => setPinOpen(true)} className="text-xs text-(--color-text-dim) hover:text-(--color-text)">
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
    </div>
  );
}

/** Booster Tutor's sign-in screen: the whole app waits behind it. */
export function SignIn({ message, onSignedIn }: { message?: string; onSignedIn: (me: Me) => void }) {
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

        <SignInForm message={message} onSignedIn={onSignedIn} />

        <p className="text-center text-[11px] text-(--color-text-dim)">
          Booster Tutor is unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy.
        </p>
      </div>
    </div>
  );
}

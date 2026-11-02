import { Suspense, lazy, useEffect, useState } from "react";
import { cachedMe, can, checkAuth, type Me } from "./lib/auth";
import { LifeCounter } from "./components/LifeCounter";
import { AuthGate } from "./components/AuthGate";
import { Icon } from "./components/Icon";

// Booster Tutor itself (packs, decks, the judge, card search), only loaded when someone opens it.
const App = lazy(() => import("./App"));

/**
 * LifeTutor: the life counter for anyone, no sign-in, with Booster Tutor
 * behind an invite. Opens on the counter's home screen. Who's signed in is
 * checked in the background, so the tray can offer the judge to people who
 * have it; the home screen's Booster Tutor card opens the full app (or its
 * sign-in, which can be skipped back to the counter).
 */
export function TableApp() {
  const [mode, setMode] = useState<"life" | "app">("life");
  const [me, setMe] = useState<Me | null>(cachedMe);

  useEffect(() => {
    document.title = "LifeTutor";
    document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute("href", "/lifetutor-192.png");
    document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.setAttribute("href", "/lifetutor-apple-touch-icon.png");
  }, []);

  // Re-check whenever we come back to the counter: a sign-in or sign-out may have happened in the app.
  useEffect(() => {
    if (mode !== "life") return;
    let live = true;
    void checkAuth().then((r) => {
      if (live) setMe(r.kind === "signedIn" ? r.me : null);
    });
    return () => {
      live = false;
    };
  }, [mode]);

  if (mode === "app") {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-(--color-text-dim)">Loading…</div>}>
        <AuthGate onSkip={() => setMode("life")}>
          <App />
        </AuthGate>
      </Suspense>
    );
  }

  return <LifeCounter title="LifeTutor" canJudge={can(me, "judge")} more={<BoosterTutorCard me={me} onOpen={() => setMode("app")} />} />;
}

/** The home screen's way into Booster Tutor: open it, or sign in with an invite first. */
function BoosterTutorCard({ me, onOpen }: { me: Me | null; onOpen: () => void }) {
  const head = "text-[11px] font-medium tracking-wide text-(--color-text-dim) uppercase";
  const what = me
    ? [can(me, "play") && "open packs and random decks", can(me, "judge") && "the rules judge", "card search"].filter(Boolean).join(", ")
    : "open packs from Ari's cubes, random decks and the rules judge";
  return (
    <section className="space-y-2">
      <div className={head}>Booster Tutor</div>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-2xl border border-(--color-border) bg-(--color-bg-elev) px-4 py-3.5 text-left hover:bg-white/5"
      >
        <Icon name="cube" className="h-6 w-6 shrink-0 text-(--color-accent)" />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">{me ? `Open Booster Tutor` : "I have an invite"}</span>
          <span className="block text-sm text-(--color-text-dim)">
            {me ? `Signed in as ${me.name}: ${what}.` : `With an invite from Ari: ${what}. Looking up a card needs no invite: it's in the tray during a game.`}
          </span>
        </span>
        <Icon name="chevron" className="h-5 w-5 shrink-0 text-(--color-text-dim)" />
      </button>
    </section>
  );
}

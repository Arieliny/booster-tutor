import { useEffect, useState } from "react";
import { cachedMe, can, checkAuth, redeemLink, signOut, takeLinkToken, type Me } from "./lib/auth";
import { LifeCounter } from "./components/LifeCounter";
import { SignInForm } from "./components/SignIn";

const INTRO_KEY = "booster-tutor-life-intro-seen";

/**
 * LifeTutor: the life counter on its own. No sign-in to play, and nothing of
 * Booster Tutor beyond the game: the home screen, the table, Settings. The
 * one thing an invite unlocks is the judge in the tray; signing in lives at
 * the foot of Settings (a /join link signs in on the spot).
 */
export function TableApp() {
  const [me, setMe] = useState<Me | null>(cachedMe);
  const [introSeen, setIntroSeen] = useState(() => {
    try {
      return localStorage.getItem(INTRO_KEY) === "1";
    } catch {
      return true;
    }
  });
  const dismissIntro = () => {
    setIntroSeen(true);
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {
      // Without storage the welcome just comes back next time.
    }
  };

  useEffect(() => {
    document.title = "LifeTutor";
    document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute("href", "/lifetutor-192.png");
    document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.setAttribute("href", "/lifetutor-apple-touch-icon.png");
  }, []);

  // Who's here, in the background: a /join link signs in; otherwise the server
  // confirms (or drops) the cached profile. The game never waits for this.
  useEffect(() => {
    let live = true;
    const fromServer = () => checkAuth().then((r) => (r.kind === "signedIn" ? r.me : null));
    const token = takeLinkToken();
    const who = token ? redeemLink(token).catch(fromServer) : fromServer();
    void who.then((m) => {
      if (live) setMe(m);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <LifeCounter
      title="LifeTutor"
      canJudge={can(me, "judge")}
      welcome={!introSeen && <Welcome onDismiss={dismissIntro} />}
      judgeAccess={<JudgeAccess me={me} onMe={setMe} />}
    />
  );
}

/** The first visit: what this is and how a game goes, in a few lines. */
function Welcome({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className="space-y-3 rounded-2xl border border-(--color-border) bg-(--color-bg-elev) px-4 py-3.5">
      <p className="text-base font-semibold text-(--color-text)">A life counter for Magic, for 2 to 6 players around one phone.</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-(--color-text-dim)">
        <li>Pick players and starting life below, then Start.</li>
        <li>Tap the left half of your card to lose life, the right half to gain it; hold for 10.</li>
        <li>The ⋯ in your corner adds counters, commander damage and your color.</li>
        <li>The round button in the middle has the dice, the monarch, history, card lookup and a new game.</li>
      </ul>
      <button type="button" onClick={onDismiss} className="w-full rounded-lg border border-(--color-border) py-2 text-sm text-(--color-text) hover:bg-white/5">
        Got it
      </button>
    </section>
  );
}

/** The foot of Settings: the judge needs an invite; sign in here, or see who's signed in and sign out. */
function JudgeAccess({ me, onMe }: { me: Me | null; onMe: (me: Me | null) => void }) {
  const head = "text-[11px] font-medium tracking-wide text-(--color-text-dim) uppercase";
  const box = "space-y-3 rounded-2xl border border-(--color-border) bg-(--color-bg-elev) px-4 py-3.5";
  if (me) {
    return (
      <section className="space-y-2">
        <div className={head}>The judge</div>
        <div className={box}>
          <p className="text-sm text-(--color-text)">
            Signed in as <strong>{me.name}</strong>.{" "}
            {can(me, "judge") ? "The judge is in the tray during a game." : "This invite doesn't include the judge; ask Ari if you'd like it."}
          </p>
          <button
            type="button"
            onClick={() => void signOut().finally(() => onMe(null))}
            className="rounded-lg border border-(--color-border) px-3 py-2 text-sm text-(--color-text) hover:bg-white/5"
          >
            Sign out of this device
          </button>
        </div>
      </section>
    );
  }
  return (
    <section className="space-y-2">
      <div className={head}>The judge</div>
      <div className={box}>
        <p className="text-sm text-(--color-text-dim)">
          Ask a rules question about the cards on the table and get a ruling with the rules it rests on, without leaving the game. It needs an invite from Ari,
          because each ruling costs him a little: he sends you a personal link, and opening it on this phone (or pasting it here) keeps you signed in.
        </p>
        <SignInForm onSignedIn={onMe} />
      </div>
    </section>
  );
}

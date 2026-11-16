import { useEffect, useLayoutEffect, useState } from "react";
import { cachedMe, can, checkAuth, redeemLink, signOut, takeLinkToken, type Me } from "./lib/auth";
import { LifeCounter } from "./components/LifeCounter";
import { SignInForm } from "./components/SignIn";
import { CardDbSettings } from "./components/CardDbPanel";
import { UpdateBanner } from "./components/UpdateBanner";
import { InstallCard } from "./components/InstallCard";
import { Icon } from "./components/Icon";
import { useCardDbAutoUpdate } from "./lib/card-db";
import { APPEARANCES, applyAppearance, loadAppearance, saveAppearance, type Appearance } from "./lib/appearance";

const INTRO_KEY = "booster-tutor-life-intro-seen";

/** A phone's worth of screen, for the frame on a wide display. */
const PHONE = { w: 412, h: 915 };

/** True inside the phone frame's iframe (or any iframe): the app renders plainly there. */
const framed = window.self !== window.top;

function useWideScreen() {
  const q = `(min-width: ${PHONE.w + 120}px) and (min-height: 600px) and (pointer: fine)`;
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return wide;
}

/**
 * On a laptop, LifeTutor sits centred in a drawn phone, so it looks and
 * behaves as it does on one. The phone's screen is an iframe of the app
 * itself: a real phone-sized viewport, so nothing inside needs to know.
 * Same origin, so the game and settings are the same ones as when the
 * window is narrow and the app renders plainly.
 */
export function TableApp() {
  const wide = useWideScreen();
  if (framed || !wide) return <TableAppInner />;
  return <PhoneFrame />;
}

function PhoneFrame() {
  // The phone shrinks to fit the window, never grows.
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 64) / (PHONE.w + 24), (window.innerHeight - 64) / (PHONE.h + 24)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  // The screen opens whatever this window opened (a /join link included); the address bar is then tidied.
  const [src] = useState(() => location.pathname + location.search + location.hash);
  useEffect(() => {
    document.title = "LifeTutor";
    document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute("href", "/lifetutor-192.png");
    if (location.hash) history.replaceState(null, "", "/");
  }, []);
  return (
    <div className="flex h-dvh items-center justify-center overflow-hidden bg-[#05060a] p-8">
      <div
        className="shrink-0 rounded-[3.5rem] border-[12px] border-[#262a35] bg-black shadow-[0_40px_100px_rgba(0,0,0,0.7),inset_0_0_0_2px_#0b0d12]"
        style={{ transform: `scale(${scale})`, transformOrigin: "center" }}
      >
        <iframe
          src={src}
          title="LifeTutor"
          allow="screen-wake-lock"
          className="block rounded-[2.75rem] bg-black"
          style={{ width: PHONE.w, height: PHONE.h }}
        />
      </div>
    </div>
  );
}

/**
 * LifeTutor: the life counter on its own. No sign-in to play, and nothing of
 * Booster Tutor beyond the game: the home screen, the table, Settings. The
 * one thing an invite unlocks is the judge in the tray; signing in lives at
 * the foot of Settings (a /join link signs in on the spot).
 */
function TableAppInner() {
  const [me, setMe] = useState<Me | null>(cachedMe);
  // What opening an invite link did, said once on the home screen (it otherwise looks the same either way).
  const [notice, setNotice] = useState<Notice | null>(null);
  const [appearance, setAppearance] = useState<Appearance>(loadAppearance);
  useEffect(() => {
    saveAppearance(appearance);
    return applyAppearance(appearance);
  }, [appearance]);
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

  // Keep the offline card database current (new sets) if this phone downloaded it.
  useCardDbAutoUpdate();

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
    const who = token
      ? redeemLink(token).then(
          (m) => {
            if (live) setNotice({ kind: "signedIn", name: m.name, judge: can(m, "judge") });
            return m;
          },
          (err: unknown) => {
            if (live) setNotice({ kind: "linkFailed", message: err instanceof Error ? err.message : String(err) });
            return fromServer();
          },
        )
      : fromServer();
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
      welcome={!introSeen && ((startTour) => <Welcome onTour={() => (dismissIntro(), startTour())} onDismiss={dismissIntro} />)}
      judgeAccess={<JudgeAccess me={me} onMe={setMe} />}
      judgeSignedInAs={me && !can(me, "judge") ? me.name : undefined}
      onJudgeAccessLost={() => {
        // Ask the server who we are now (it also drops the stale profile this phone kept), and lock the judge.
        void checkAuth().then((r) => setMe(r.kind === "signedIn" ? r.me : null));
      }}
      cardDbSettings={<CardDbSettings />}
      banner={
        <>
          {notice && <SignInNotice notice={notice} onDismiss={() => setNotice(null)} />}
          <UpdateBanner className="mb-2 text-left" />
          <InstallCard className="mb-2" />
        </>
      }
      appearance={<AppearanceSection value={appearance} onChange={setAppearance} />}
    />
  );
}

/** Settings > Appearance: follow the phone, or light or dark whatever it says. */
function AppearanceSection({ value, onChange }: { value: Appearance; onChange: (a: Appearance) => void }) {
  return (
    <section className="space-y-2">
      <div className="text-[11px] font-medium tracking-wide text-(--color-text-dim) uppercase">Appearance</div>
      <div role="group" aria-label="Appearance" className="grid grid-cols-3 gap-1 rounded-xl bg-(--color-text)/10 p-1">
        {APPEARANCES.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => onChange(a.key)}
            aria-pressed={value === a.key}
            className={
              "rounded-[9px] py-2 text-sm " +
              (value === a.key ? "bg-(--color-bg-elev) font-semibold text-(--color-text) shadow" : "text-(--color-text-dim) hover:bg-(--color-text)/5")
            }
          >
            {a.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/** The first visit: what this is and how a game goes, in a few lines. */
/** The first visit: what LifeTutor is, and an offer of the tour (LifeTour) or to go straight in. */
function Welcome({ onTour, onDismiss }: { onTour: () => void; onDismiss: () => void }) {
  return (
    <section className="space-y-3 rounded-2xl border border-(--color-border) bg-(--color-bg-elev) px-4 py-3.5 text-left">
      <p className="text-base font-semibold text-(--color-text)">A life counter for Magic, for 2 to 6 players around one phone.</p>
      <p className="text-sm text-(--color-text-dim)">New here? A one-minute tour of the table shows where everything is. It's in Settings too.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-12 flex-1 rounded-lg border border-(--color-border) text-sm text-(--color-text) hover:bg-(--color-text)/5"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={onTour}
          className="min-h-12 flex-[2] rounded-lg bg-(--color-accent) text-sm font-semibold text-(--color-accent-ink) hover:bg-(--color-accent-bright)"
        >
          Show me around
        </button>
      </div>
    </section>
  );
}

type Notice = { kind: "signedIn"; name: string; judge: boolean } | { kind: "linkFailed"; message: string };

/**
 * A used or expired invite, said for LifeTutor: the usual way to use one up is tapping a Booster
 * Tutor link, which signs in there instead. Anything else (no signal, say) keeps its own message.
 */
function usedLinkHelp(error: string): string | undefined {
  if (!/already been used|expired/i.test(error)) return undefined;
  return "It's been used already, or it's over 7 days old. An invite works once, in the app it opens: if it opened Booster Tutor, it was used there. Ask Ari for a new LifeTutor link.";
}

/** After an invite link: signed in (and whether the judge came with it), or why the link didn't work. */
function SignInNotice({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const ok = notice.kind === "signedIn";
  return (
    <div
      role="status"
      className={
        "mb-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-left text-sm text-(--color-text) " +
        (ok ? "border-emerald-500/50 bg-emerald-500/10" : "border-amber-500/50 bg-amber-500/10")
      }
    >
      <p className="min-w-0 flex-1 py-1.5">
        {ok ? (
          <>
            Signed in as <strong>{notice.name}</strong>.{" "}
            {notice.judge
              ? "The judge is in the tray during a game: tap the round button in the middle."
              : "This invite doesn't include the judge; ask Ari if you'd like it."}
          </>
        ) : (
          <>
            That invite link didn't work. {usedLinkHelp(notice.message) ?? notice.message}
          </>
        )}
      </p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-mr-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg hover:bg-(--color-text)/10">
        <Icon name="close" className="h-5 w-5" />
      </button>
    </div>
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
        <SignInForm onSignedIn={onMe} errorHelp={usedLinkHelp} ownerPin={false} />
      </div>
    </section>
  );
}

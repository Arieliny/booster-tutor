import { useCallback, useEffect, useState } from "react";
import {
  FEATURE_LABELS,
  adminCreate,
  adminList,
  adminNewLink,
  adminRemove,
  adminSignOutEverywhere,
  adminUpdate,
  signInUrl,
  type AdminUser,
  type Feature,
} from "../lib/auth";

const FEATURES = Object.keys(FEATURE_LABELS) as Feature[];

/** Judge spend, estimated from Anthropic's list prices. */
const spend = (dollars: number) => `≈ $${dollars.toFixed(2)}`;

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 60 * 24) return "today";
  const days = Math.round(mins / (60 * 24));
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** A freshly made sign-in link, with copy / share. Links work once. */
function LinkBox({ name, token, onDone }: { name: string; token: string; onDone: () => void }) {
  const url = signInUrl(token);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === "function";
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-(--color-accent)/60 bg-(--color-accent)/10 p-3 text-sm">
      <div className="text-(--color-text)">
        Sign-in link for <b className="font-medium">{name}</b> · works once, expires in 7 days
      </div>
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded border border-(--color-border) bg-(--color-bg) px-2 py-1.5 font-mono text-xs text-(--color-text)"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              // The field is selectable as a fallback.
            }
          }}
          className="rounded bg-(--color-accent) px-3 py-1.5 font-medium text-black hover:bg-(--color-accent-bright)"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        {canShare && (
          <button
            type="button"
            onClick={() => navigator.share({ title: "Booster Tutor", text: `Your Booster Tutor sign-in link`, url }).catch(() => {})}
            className="rounded border border-(--color-border) px-3 py-1.5 text-(--color-text) hover:bg-white/5"
          >
            Share…
          </button>
        )}
        <button type="button" onClick={onDone} className="ml-auto text-xs text-(--color-text-dim) hover:text-(--color-text)">
          Done
        </button>
      </div>
    </div>
  );
}

/** Owner only: the people who can use the app and what each one can use. */
/** A guest's monthly judge allowance (each ruling is billed to the owner's API key). */
function JudgeLimit({
  u,
  defaultLimit,
  onSave,
}: {
  u: AdminUser;
  defaultLimit: number;
  onSave: (limit: number | null) => void;
}) {
  const current = u.judgeLimit ?? defaultLimit;
  const [draft, setDraft] = useState(String(current));
  const save = () => {
    const n = Math.max(0, Math.min(500, Math.round(Number(draft))));
    if (!Number.isFinite(n) || n === current) return setDraft(String(current));
    onSave(n === defaultLimit ? null : n);
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-(--color-text-dim)">
      <span>Judge: {u.judge.used} used this month of</span>
      <input
        type="number"
        min={0}
        max={500}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        aria-label={`${u.name}'s rulings a month`}
        className="w-16 rounded border border-(--color-border) bg-(--color-bg) px-2 py-1 text-center text-(--color-text)"
      />
      <span>
        a month{u.judgeLimit === undefined ? "" : ` · default is ${defaultLimit}`} · {spend(u.judge.dollars)} this month
      </span>
    </div>
  );
}

export function Admin() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ userId: string; name: string; token: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [newFeatures, setNewFeatures] = useState<Feature[]>(["setReview"]);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [defaultLimit, setDefaultLimit] = useState(50);

  const reload = useCallback(async () => {
    try {
      const d = await adminList();
      setUsers(d.users);
      setDefaultLimit(d.defaultJudgeLimit);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    let live = true;
    adminList()
      .then((d) => {
        if (!live) return;
        setUsers(d.users);
        setDefaultLimit(d.defaultJudgeLimit);
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      live = false;
    };
  }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggle = (list: Feature[], f: Feature) => (list.includes(f) ? list.filter((x) => x !== f) : [...list, f]);

  if (!users) {
    return <p className="text-sm text-(--color-text-dim)">{error ?? "Loading people…"}</p>;
  }

  const owner = users.find((u) => u.role === "owner");
  const guests = users.filter((u) => u.role === "guest");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="text-sm text-(--color-text-dim)">
        Guests see only what you tick. Sign-in links work once and expire after 7 days.
      </p>
      <p className="text-sm text-(--color-text-dim)">
        Judge spend this month, everyone: <b className="font-medium text-(--color-text)">{spend(users.reduce((sum, u) => sum + u.judge.dollars, 0))}</b>
        <span className="block text-xs">
          Estimated from Anthropic's list prices (rulings, web searches and the Magic-only check). The Anthropic Console has the real bill.
        </span>
      </p>

      {error && <p className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}

      {owner && (
        <section className="rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1">
              <div className="font-medium text-(--color-text)">{owner.name} (you)</div>
              <div className="text-xs text-(--color-text-dim)">
                Owner · everything · {owner.devices} device{owner.devices === 1 ? "" : "s"} signed in
              </div>
              <div className="text-xs text-(--color-text-dim)">
                Judge: {owner.judge.used} this month · no limit · {spend(owner.judge.dollars)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => act(async () => setLink({ userId: owner.id, name: "your device", token: await adminNewLink(owner.id) }))}
              className="rounded border border-(--color-border) px-3 py-1.5 text-sm text-(--color-text) hover:bg-white/5"
            >
              Add one of your devices
            </button>
          </div>
          {link?.userId === owner.id && <LinkBox name="your device" token={link.token} onDone={() => setLink(null)} />}
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-(--color-text)">Guests · {guests.length}</h3>
        {guests.length === 0 && <p className="text-sm text-(--color-text-dim)">Nobody else yet.</p>}
        {guests.map((u) => (
          <div key={u.id} className="rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1">
                <div className="font-medium text-(--color-text)">{u.name}</div>
                <div className="text-xs text-(--color-text-dim)">
                  {u.devices > 0
                    ? `${u.devices} device${u.devices === 1 ? "" : "s"} · last seen ${ago(u.lastSeen)}`
                    : "Not signed in anywhere"}
                  {u.pendingLink && <span className="ml-2 text-amber-300">· link not opened yet</span>}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {FEATURES.map((f) => (
                <label key={f} className="flex items-center gap-2 text-sm text-(--color-text)" title={FEATURE_LABELS[f].hint}>
                  <input
                    type="checkbox"
                    checked={u.features.includes(f)}
                    onChange={() => act(() => adminUpdate(u.id, { features: toggle(u.features, f) }))}
                  />
                  {FEATURE_LABELS[f].label}
                </label>
              ))}
            </div>
            {u.features.includes("judge") && (
              <JudgeLimit
                key={`${u.id}:${u.judgeLimit ?? "default"}`}
                u={u}
                defaultLimit={defaultLimit}
                onSave={(judgeLimit) => act(() => adminUpdate(u.id, { judgeLimit }))}
              />
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <button
                type="button"
                onClick={() => act(async () => setLink({ userId: u.id, name: u.name, token: await adminNewLink(u.id) }))}
                className="rounded border border-(--color-border) px-3 py-1.5 text-(--color-text) hover:bg-white/5"
              >
                New sign-in link
              </button>
              <button
                type="button"
                onClick={() => act(() => adminSignOutEverywhere(u.id))}
                disabled={u.devices === 0}
                className="rounded border border-(--color-border) px-3 py-1.5 text-(--color-text-dim) hover:bg-white/5 disabled:opacity-40"
              >
                Sign out everywhere
              </button>
              {confirmRemove === u.id ? (
                <span className="flex items-center gap-2">
                  <span className="text-(--color-text-dim)">Remove {u.name}?</span>
                  <button
                    type="button"
                    onClick={() => act(async () => {
                      await adminRemove(u.id);
                      setConfirmRemove(null);
                    })}
                    className="rounded bg-red-500/80 px-3 py-1.5 text-white hover:bg-red-500"
                  >
                    Remove
                  </button>
                  <button type="button" onClick={() => setConfirmRemove(null)} className="text-(--color-text-dim)">
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(u.id)}
                  className="ml-auto rounded px-3 py-1.5 text-red-300 hover:bg-red-500/10"
                >
                  Remove
                </button>
              )}
            </div>
            {link?.userId === u.id && <LinkBox name={u.name} token={link.token} onDone={() => setLink(null)} />}
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-dashed border-(--color-border) p-4">
        <h3 className="mb-2 text-sm font-semibold text-(--color-text)">Add a person</h3>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newName.trim();
            if (!name) return;
            void act(async () => {
              const { token, userId } = await adminCreate(name, newFeatures);
              setLink({ userId, name, token });
              setNewName("");
            });
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Their name"
            maxLength={40}
            className="w-full rounded border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) placeholder:text-(--color-text-dim)"
          />
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {FEATURES.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm text-(--color-text)" title={FEATURE_LABELS[f].hint}>
                <input type="checkbox" checked={newFeatures.includes(f)} onChange={() => setNewFeatures(toggle(newFeatures, f))} />
                {FEATURE_LABELS[f].label}
              </label>
            ))}
          </div>
          <p className="text-xs text-(--color-text-dim)">
            My cube and Look up are just for you.
          </p>
          <button
            type="submit"
            disabled={!newName.trim()}
            className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-black hover:bg-(--color-accent-bright) disabled:opacity-50"
          >
            Create and get their link
          </button>
        </form>
      </section>
    </div>
  );
}

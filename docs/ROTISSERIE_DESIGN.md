# Rotisserie Draft Mode — Design

Draft design, 2026-07-31. Not yet built. This is a planning doc, not committed
behavior.

## What rotisserie is

A draft format with **no packs and perfect information**. One shared, finite cube
is the pool. Players draft in **snake order** (1→2→…→N, then N→…→1, repeating),
taking **exactly one card per turn** from what remains. Every pick is public and
permanent. It's the most strategic draft format — hate-drafting, signal-reading,
and "will it wheel?" math are the whole game.

This is the opposite of what Booster Tutor does today (random packs, single
player). But most of the plumbing already exists.

## Why the app is close to ready

- **Finite shared pool** — cubes are already loaded, Scryfall-enriched, stored
  per-cube (`cubes` IDB store, `bundled-cube.ts`).
- **Pick-with-removal** — session state already removes picked cards from the
  available pool; rotisserie applies the same mechanic to the whole cube.
- **Sync-code backbone** — `sync.ts` + Upstash Redis already namespace a dataset
  by a user-generated code across devices. That's the join mechanism for a draft.

## The one hard architectural change

**Rotisserie state must be server-authoritative.** Everywhere else in the app,
local IndexedDB is the source of truth and cloud sync is best-effort
last-write-wins. That model is *wrong* for rotisserie: two players on two devices
cannot both hold the "truth" about who took a card. Last-write-wins would let two
people claim the same card and silently clobber one.

So the draft's canonical state lives in Redis, and clients are views that poll it.
Local IDB is only a cache/optimistic layer.

## Data model (Redis, namespaced by draft code)

Draft code works like the existing sync code (6–16 alphanumeric), separate
namespace `draft:{code}`.

```
draft:{code}:meta      → JSON { cubeId, cubeName, seats: [{id,name}], status,
                                 createdAtISO, snakeLen }
                          status ∈ "lobby" | "active" | "complete"
draft:{code}:claims    → HASH  field = cardId, value = seatId   (claimed cards)
draft:{code}:order     → LIST  append-only pick log: "cardId:seatId:pickNo"
draft:{code}:cursor    → STRING integer pick number (0-indexed), = next pick
```

Snake seat for pick `p` with `N` seats:
`round = floor(p / N); seat = (round % 2 === 0) ? p % N : N - 1 - (p % N)`.

Cube card list itself is uploaded once to `draft:{code}:cube` (reuse the enriched
JSON shape) so joiners don't each re-enrich.

## The atomic pick (the crux)

A single **Redis Lua script** runs the whole pick as one atomic op — no race
window:

1. Read `cursor` → compute whose turn it is via the snake formula.
2. Reject if `callerSeatId !== turnSeat` (not your turn).
3. Reject if `HEXISTS claims cardId` (already taken — belt-and-suspenders; turn
   check alone should prevent it, but two cards can't be claimed for one cursor).
4. `HSET claims cardId seatId`; `RPUSH order "cardId:seatId:cursor"`;
   `INCR cursor`.
5. If cursor reached `seats * cardsPerSeat` (or pool exhausted) → set status
   `complete`.
6. Return the new cursor + the claim.

Because Upstash runs Lua atomically, no two clients can both succeed on the same
turn. Everything else (lobby, polling, UI) can be sloppy/optimistic; only this
script must be exact.

## Serverless API (extends existing `api/`)

New `api/draft.ts` (same Vercel-style handler pattern as `api/sync.ts`):

- `POST ?action=create`  → make draft, seed cube + meta, return code.
- `POST ?action=join`    → claim a seat (`HSETNX`-style so two joiners don't grab
  the same seat), return seatId.
- `POST ?action=start`   → lobby → active.
- `POST ?action=pick`    → run the Lua script above.
- `GET  ?code=&since=`   → return meta + claims + order since a pick number
  (clients poll this; `since` keeps payloads small).

No websockets (Vercel serverless doesn't do them cleanly). **Poll** every ~2–3s
while it's your turn / the tab is focused; back off when idle. Async-friendly by
nature — a rotisserie can legitimately run over hours or days.

## UI

- **Lobby** (`RotisserieLobby.tsx`) — create (choose cube, seat count, your name)
  → share code; or join by code → pick an open seat. Show seated players.
- **Draft board** (`RotisserieBoard.tsx`) — the full cube as a grid; claimed
  cards greyed + badged with the taker's name; a clear "🟢 Your turn" / "waiting
  on {name}" banner; tap a card → Spotlight (reuse `Spotlight.tsx`) → "Claim".
  Your picked pile in a sidebar; a pick timeline/log.
- Reuse `Card.tsx`, `Spotlight.tsx`, `HelpTip.tsx`, the cube grid layout.

## Phasing (recommended)

- **Phase 1 — local hotseat (no server).** Pass-and-play on one device: N seats,
  snake order, claim from the full cube, all in local state. Zero concurrency
  risk, ships fast, and validates the drafting UX + snake logic + board layout.
- **Phase 2 — networked async.** Add `api/draft.ts` + the Lua script + polling +
  lobby/join. Reuses the Phase 1 board almost verbatim; the only new surface is
  transport + turn enforcement.

Build Phase 1 first; it de-risks everything and is independently useful.

## Deck-list export (with/after Phase 2)

Rotisserie players take their picked pool into a real client. Add a per-seat
**Export** button that produces **MTGO / Cockatrice** plain-text format — one
line per card, `<qty> <name>` (e.g. `1 Ancestral Recall`) — via copy-to-
clipboard or a `.txt` download. Cockatrice and MTGO both read this. Trivial to
add for local hotseat too, but deferred so the networked flow lands first.

## Open questions

- Deck size per seat / when the draft ends (cube-size ÷ seats? fixed 45? host
  sets it?).
- Timeouts for AFK players in async mode (auto-skip? just wait?).
- Whether to allow spectators / late joins (probably no on late joins once
  active).
- Reconnect / seat recovery (store seatId in localStorage keyed by draft code).

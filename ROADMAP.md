# Booster Tutor — Roadmap

Original roadmap captured 2026-04-29. Reviewed 2026-07-31: **all 5 numbered items
below shipped** — kept here as a changelog. Live planning is now the
"Future / under consideration" section.

---

## ✅ Shipped (was the 2026-04-29 roadmap)

1. **Legal / fan-site disclaimer** — `Footer.tsx`: WotC Fan Content Policy link,
   IP disclaimer, Scryfall attribution. (No separate `/about`; footer covers it.)
2. **Configurable pack size** — `Controls.tsx` numeric input; `pack-generator.ts`
   default 15, bounds 1–40, proportional Color-Balanced scaling.
3. **Multiple cubes / user uploads** — `CubeManager.tsx` upload + paste,
   `CubeSelector.tsx` dropdown, in-browser Scryfall enrichment with progress bar
   (`scryfall-enrich.ts`), per-cube sessions, IndexedDB (`cubes`/`sessions`/
   `meta`/`inventories`), legacy localStorage migration.
4. **Mobile-first picking UX** — `Spotlight.tsx` enlarged view + card strip +
   Back/Pick + DFC flip; old confirmation modal removed.
5. **Pack-open flow: "this game" vs "new match"** — two buttons in `Controls.tsx`
   + `HelpTip.tsx` tooltip; explicit Reset kept.

Also shipped beyond the original list: **Inventory** (received/missing per cube),
**cloud sync** (`sync.ts` + `api/`), **cube archive / soft-delete**,
**CubeCobra import** (below).

## ✅ Shared public library + edit password (2026-09-18)

Replaced per-user sync codes with **one shared library** everyone can read.

- `src/lib/sync.ts` uses a fixed namespace (`boostertutor`) — no code to enter,
  no setup, and cubes survive a cleared browser because they live in Upstash.
- **Writes are gated server-side**: `POST /api/sync` requires the `x-edit-key`
  header to match the **`EDIT_PASSWORD`** env var (constant-time compare). GET
  is open to anyone. A client-only gate would have been decorative — anyone
  could POST directly — so the check lives in the API.
- **Fails closed**: with `EDIT_PASSWORD` unset the API returns 503 instead of
  leaving the library world-writable. **Set `EDIT_PASSWORD` in Vercel or
  editing is impossible.**
- `EditAccess.tsx` (replaces `SyncSettings.tsx`) is the unlock panel; the cube
  manager hides add/rename/archive/refresh while locked.
- Drafting and pack-opening are never synced, so visitors can use the tool
  freely without touching the library.
- Deliberately not an account system. If the tool ever gets real users, that's
  the point to revisit multi-user.

## ✅ CubeCobra import (2026-09-18)

Import a cube straight from CubeCobra instead of uploading a list every time —
and re-pull it later in place.

- `src/lib/cubecobra.ts`: paste a cube URL or bare id → `/cube/api/cubeJSON/{id}`.
- Both CubeCobra API endpoints (`cubeJSON`, `cubelist`) send
  `access-control-allow-origin: *`, so this runs **entirely client-side — no
  serverless proxy**. (The `/cube/download/*` exports are NOT CORS-enabled.)
- Every CubeCobra card carries its `scryfall_id`, so the import skips the
  one-request-per-card enrichment and batches through Scryfall's
  `/cards/collection` (75 per request, CORS preflight verified). A 559-card cube
  costs ~8 requests instead of 559 — seconds instead of ~2 minutes, with exact
  printings.
- Cubes remember their `cubecobraId`; the cube list shows a **CubeCobra** badge
  and a **Refresh** button that re-pulls in place and reports `+added / −removed`.
- Duplicate printings are skipped (the app keys cards by `scryfall_id`), and
  unresolvable cards (CubeCobra custom cards) are reported as failures.

---

## Future / under consideration

### A. Rotisserie draft mode  *(new — biggest idea)*

A multiplayer, full-information draft from the whole cube: no packs, one card per
turn, snake order, every pick public. See **`docs/ROTISSERIE_DESIGN.md`** for the
full design. Summary:

- **Server-authoritative** state (unlike the rest of the app, where local IDB is
  the source of truth) — the shared pool + turn order can't live on one client.
- Reuses the existing **sync-code / Upstash Redis** backbone as the draft's
  join mechanism.
- Requires **atomic pick-claim** (a Redis Lua script: verify it's your turn →
  verify card unclaimed → claim → advance the snake pointer, all in one op) so
  two players can't grab the same card.
- Phased: **✅ Phase 1 = local hotseat** (pass-and-play, no server — SHIPPED
  2026-07-31) → **✅ Phase 2 = networked async** (join by code, poll for state —
  BUILT 2026-07-31, pending a deploy smoke-test on Vercel + Upstash; the
  networked path can't run under local `npm run dev`).
- Explicitly reverses the old "multi-user / draft mode = out of scope" call.

**Phase 2 (built):** a "Pass & play" / "Online" toggle in the Rotisserie tab.
Server-authoritative: `api/draft.ts` (create / poll-state / cube / pick / undo)
with an **atomic Lua pick-claim** (verify turn → verify unclaimed → claim →
advance cursor) + Lua undo; `api/_redis.ts` draft keys/meta. Client:
`src/lib/rotisserie-net.ts` (draft API + per-code "my seat" / resume storage),
`RotisserieOnline.tsx` (create / join-by-code / seat-pick / resume),
`RotisserieOnlineBoard.tsx` (2.5s polling, turn identity, pick/undo). The local
and online boards share the extracted presentational `DraftBoardView.tsx`.
Trust model: no auth; seat identity is local (localStorage), snake order is
enforced server-side by the Lua script.

**Phase 1 (shipped):** a "Rotisserie" tab. `src/lib/rotisserie.ts` (snake-order
logic + localStorage persistence per cube), `RotisserieLobby.tsx` (players 2–8,
names, cards-per-player), `RotisserieBoard.tsx` (turn banner, per-seat piles,
full-cube grid with claimed cards greyed + owner badge, search/hide-drafted
filters, claim-confirm modal, undo, new-draft), `Rotisserie.tsx` (container).
Wired into `App.tsx` as a third tab. Draft survives page reload.

**Phase 1 review pass (also shipped):** drafted cards brighten to full opacity
on hover (name shows as a tooltip); clicking any seat pile "focuses" that
player — the grid filters to just their drafted cards for easy async review,
with a "Show whole cube" reset.

### Phase 2 follow-on: export deck lists

Once players are on separate machines (Phase 2), each person needs to export
their picked cards for a client. Support **MTGO / Cockatrice** plain-text `.txt`
format (lines like `1 Ancestral Recall`) — a per-seat "Export" button that
downloads or copies the list. (Trivial to add for local hotseat too; deferred
per Ari's sequencing — do it with/after Phase 2.)

### B. Per-cube power tagging

Power-Weighted generation mode is removed from the UI (`GenerationMode` is only
`"random" | "color-balanced"`). Likely future direction: make tier data a
per-cube property set during upload (optional column or a tagging step), and only
expose Power-Weighted for cubes that carry tier data.

---

## Out of scope (still)

- Statistics / analytics.
- Authentication.
- ~~Multi-user / shared sessions~~ and ~~draft mode~~ — reconsidered; see item A.

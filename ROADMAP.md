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
  header to match the **`EDIT_PIN`** env var (constant-time compare). GET is
  open to anyone. A client-only gate would have been decorative — anyone could
  POST directly — so the check lives in the API.
- **Rate limited**: a short numeric PIN is only ~10k guesses wide, so wrong
  attempts are counted per IP in Redis — 10 failures locks that IP out for 15
  minutes, and a correct PIN clears the counter. That's what makes a memorable
  PIN safe here. Per-IP (not global) so a stranger can't lock the owner out.
- **Fails closed**: with `EDIT_PIN` unset the API returns 503 instead of
  leaving the library world-writable. **Set `EDIT_PIN` in Vercel or editing is
  impossible.**
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

## ✅ Set review tab (2026-09-23)

A fourth tab: a searchable, filterable table of a podcast set review.

- Ships with **Reality Fracture** (set `fra`) commons & uncommons, graded by
  Marshall Sutcliffe and Luis Scott-Vargas on Limited Resources 872.
- Columns: card, mana cost (rendered as pips), type, rules text, rarity, a
  single grade, and a one-line note. Search across name/type/rules/notes;
  filter by rarity, colour, and "graded only"; sort by grade, name, cost or
  rarity. Defaults to grade, best first.
- **One grade, Luis first.** Luis is the primary reviewer; Marshall's grade is
  used when Luis didn't give one, with no marker in the table — Ari's call, the
  two are close enough in practice. Both grades stay in the data. 154 Luis, 27
  Marshall.
- **Sideboard is its own grade.** The show's two subgrades work differently:
  "build-around" modifies a letter, but "sideboard" replaces it, so a sideboard
  card renders **SB** and counts as graded.
- **Works on a phone.** Below `md` the table is replaced by a stacked card list
  (no horizontal scrolling) with its own sort control. Tapping a card anywhere
  opens its image; desktop keeps the hover preview and adds click-to-open.
- **Card facts come from Scryfall, not the transcript** — names, costs, rules
  text and rarity are authoritative rather than transcribed from speech. Only
  the grades and notes come from the review.
- Data is baked into `src/data/set-review-fra.json` at authoring time, and the
  tab is lazy-loaded so that file stays out of the initial bundle.
- `scripts/build-set-review.mjs` regenerates the data file from Scryfall plus
  `scripts/set-review-grades-fra.json`; its header documents the chunked LLM
  extraction that produced the grades.

**Coverage: 181 of 195 cards graded.** The 14 without a grade are all
legitimate: 5 basic lands and the 5 "Commons" lands are never discussed on the
show, and 4 cards (Refute Destiny, Semester Foreseer, Artifist Acumen, Living
Library) were discussed but never given a letter grade. Cards are left
ungraded rather than having a grade inferred from tone. The five "Annex" lands
were graded as a cycle ("they're all the same") and share that grade.

### Offline / installable (PWA)

Built for using the set review at a prerelease, where venue wifi is unusable.

- `vite-plugin-pwa` generates a manifest + Workbox service worker.
  `registerType: 'autoUpdate'`, so a deploy refreshes the app on next visit
  rather than pinning people to a stale build.
- The precache covers the app shell **and the set-review data chunk**, so the
  whole table — grades, rules text, notes — works with no connection.
- `navigateFallbackDenylist: [/^\/api\//]` keeps the SW from ever handing the
  SPA shell back for an API call. Sync failing offline is already handled.
- Card images are the one thing that can't be precached (~15 MB), so
  `src/lib/offline.ts` + `OfflinePanel.tsx` let you pull the whole set down
  deliberately while on wifi. It writes straight into the same `scryfall-images`
  cache the SW reads from, so it works even before the SW takes control.
- Icons are generated by `scripts/make-icons.mjs`, which hand-rolls the PNGs so
  the repo doesn't need an image toolchain for three flat images.

Verified by stopping the server and reloading: the app booted, all 195 rows
rendered, and a cached image served — while `/api/sync` correctly failed
instead of being served a stale shell.

### Real mana symbols

- `scripts/build-mana-symbols.mjs` pulls Scryfall's official symbol SVGs for
  exactly the symbols present in the set-review data and writes
  `src/data/mana-symbols.json` as inline `data:` URIs (23 symbols, ~75 KB).
- Inlined rather than hotlinked **because of the offline requirement** —
  runtime requests to `svgs.scryfall.io` are precisely what fails at a
  prerelease. Anything not baked in falls back to the old lettered disc.
- Colour filter buttons use the real symbols for WUBRG; multicolour is a gold
  disc (there's no official multicolour symbol) and colourless stays a plain
  disc, which covers lands and artifacts fine.

### Stale-chunk recovery (found while testing the PWA)

Asset filenames are content-hashed, so after a deploy a tab still running the
previous build — or one served from the old service-worker precache — can try
to lazy-load a chunk that no longer exists. Observed live: a 404 on the old
`SetReview-*.js`, a rejected dynamic import, and a blank page.

`src/main.tsx` listens for `vite:preloadError` and reloads once, picking up the
new `index.html` and assets. A 15-second cooldown in `sessionStorage` prevents
a reload loop if the chunk is genuinely gone.

A second, subtler version of the same problem: the worker uses `skipWaiting` +
`clientsClaim`, so a new build activates and claims open tabs — but **claiming
a page does not reload it**. The tab keeps running whatever the old worker
served, which is how `/set-review` could load a build that predated routing and
silently show the default tab. `main.tsx` also listens for `controllerchange`
and reloads when a new worker takes over, guarded by whether the page had a
controller at startup so a first-ever install doesn't refresh itself.

### Per-tab URLs

Each tab has a real path, so views can be linked and bookmarked:
`/` (packs), `/rotisserie`, `/inventory`, `/set-review`.

- `src/lib/routes.ts` is a hand-rolled path<->tab map. No router dependency:
  four static routes, no params, no nesting. `App.tsx` seeds the tab from
  `location.pathname`, pushes state on tab change, and listens for `popstate`
  so back/forward work.
- `vercel.json` rewrites unknown paths to `index.html`, excluding `/api/` so
  the serverless functions still resolve.
- Offline deep links work too — the service worker's `navigateFallback` serves
  the precached shell, verified by loading `/set-review` with the server
  stopped.

### Print view (`/set-review/print`)

A condensed reference for use at the table, asked for by a friend who wanted
"as condensed as possible, no need for what's on the card".

- Grade, name, mana cost and the comment only — no rules text, no images.
  Grouped into colour sections (W/U/B/R/G/multicolour/colourless), ordered by
  mana value ascending within each.
- Toggles for comments and graded-only; defaults to graded-only (185 cards).
- Sortable within each colour: mana value, grade or name, with a direction
  toggle. Each key picks the direction that reads as "best first" when
  selected. Equal keys fall back to mana value then name, so grade order
  stays scannable (all the B's ordered cheap to expensive).
- **"Page per colour" toggle**, because the two people using this want opposite
  things — one likes a page per colour as a reference, the other wants the
  fewest pages possible. It changes the structure, not just a break rule:
  - *off (default, fewest pages)*: every colour flows through one shared
    two-column stream, so a section starts wherever the last one ended.
  - *on*: each section gets its own two-column block and
    `break-before: page` — except the first, or you get a blank leading page.
    Columns live on the section's list so the forced break lands on a normal
    block rather than inside a multi-column flow, where browsers are
    inconsistent.
- `break-inside: avoid` applies to individual entries only, so a single card
  never splits; headings use `break-after: avoid` so they aren't orphaned.
- The title block is screen-only (`print:hidden`) — on paper it consumed a page
  of its own.
- The app shell is a `min-h-screen` flex column for the screen, which fragments
  badly across printed pages; `print:block print:min-h-0 print:p-0` collapses it.
- **The whole theme flips light for print** by overriding the CSS variables in
  a single `@media print` block in `index.css`, rather than per-component print
  rules. App chrome (header, tabs, footer) is `print:hidden`.
- Mana pips are `<img>` data URIs, so they still print when the browser's
  "background graphics" option is off — CSS-background pips would vanish.
- Split cards show the front face for both name and cost, so the two agree.

## ✅ Cube export (.txt) + pancake draft file (2026-09-18)

Export any cube as plain text from Manage cubes → **Export** (read-only, so it
works whether or not editing is unlocked).

- `src/lib/cube-export.ts` + `CubeExport.tsx`.
- **Cube list**: `1 Name (SET) 123` per line — Draftmancer / MTGO / Cockatrice,
  and round-trips through our own paste importer. Double-faced cards export as
  their front face, which is what deck-list tools expect.
- **Pancake draft file**: the same list wrapped in Draftmancer's custom card
  list format with a `[Settings]` block that configures the format outright.

### How pancake maps onto Draftmancer

Pancake (Joost Vunderink, 2013) is a 2-player pick-and-burn cube format:
11-card packs; per pack the opener picks 1, passes, the opponent picks 2 and
burns 2, passes back, and the opener picks 2 and burns the last 4.

Draftmancer has **no** Pancake mode, but its `boosterSettings` accepts a
sequence of pick/burn phases per booster, and with two players a pack changes
hands after every phase — which *is* the swap. So it falls out as:

```
"boosterSettings": [{ "picks": [1,2,2], "burns": [0,2,4] }, ...]
```

5 picked + 6 burned = an 11-card pack, with `[Pancake(11)]` setting pack size
and `boostersPerPlayer: 9` (clamped down for cubes smaller than 198 cards).

---

## ✅ Cards and rules keep themselves current (2026-11-02)

New sets reach the offline card list and the judge's Comprehensive Rules without a code push.

- Both are fetched at build time (`build-card-db.mjs`, `fetch-cr.mjs`). `write-data-version.mjs`
  then records what the build got: card-db build time, Scryfall's card count, the CR file URL
  (`public/data-version.json` for the app, `data/data-version.json` for the function).
- The daily cron (`api/keepalive.ts`, shares the keep-alive so the Hobby cron limit isn't an issue)
  runs `api/_data-refresh.ts`: if Wizards' rules page links a new CR file, Scryfall's card count
  changed (new previews), or the build is over 14 days old, it POSTs the project's Vercel Deploy
  Hook (env `DEPLOY_HOOK_URL`, one per Vercel project: Booster Tutor and LifeTutor each rebuild
  themselves). At most one rebuild per project per 20 hours (Redis key per `VERCEL_PROJECT_ID`).
  The cron's JSON answer says what it decided (`current` / `rebuilding` / `waiting` / `no-hook`).
- Devices that downloaded the offline database check `/card-db/index.json` when the app opens (at
  most every 12 hours, online, not on Data Saver) and download a changed database in the background
  (`refreshDbIfNewer` in `lib/card-db.ts`), and again when the phone comes back online or changes network.
  **Wi-Fi only** (Ari, 2026-11-02): on by default, a checkbox under the card database in Settings turns it
  off. Uses Chrome's `navigator.connection.type`; where the browser won't say (iPhone, Firefox) a touch
  device waits and a computer goes ahead (`networkAllows`). The CHECK (the small index) runs on any
  connection; only the download waits. A newer database found but not downloaded is remembered
  (`booster-tutor-card-db-newer`) and shown as a notice (`CardDbNotice`: "New cards are out" + Update now) on
  the life counter's Look up a card and the Look up tab's other-cards box; nothing shows there otherwise.
  The panel with the settings lives only in Settings (Booster Tutor's Settings sheet; LifeTutor's Settings
  page via `CardDbSettings`, and LifeTutor runs `useCardDbAutoUpdate` too).
- **Updates download only what changed** (Ari, 2026-11-02). The database is ~220 parts under
  `/card-db/`, one per month of first printing (`scripts/lib/card-db-parts.mjs`), each named by a hash of
  its content, plus `index.json` (parts, gzip sizes, and a `version` hashed from them). A phone fetches
  only the part files it lacks, writes the index last, then deletes parts no longer listed. "Newer"
  means a different `version`, not a later build time: before this, every deploy (any code push)
  made every phone re-download the whole 4 MB. Measured against the Oct 11 database (358 new cards,
  8 changed): 0.2 MB by month vs 1.4 MB by year vs 4 MB whole. The notice and Settings show the
  update's real size ("Update (~50 KB)"); with nothing waiting the button is "Check for updates".
  Phones holding the old one-file `/card-db.json` keep reading it and move to parts on their first
  update (a full download, once).
- Not covered: Set grades for a new set are still a manual build (`build-set-review.mjs`).

---

## ✅ "Did you mean ...?" in card searches (2026-11-02)

When no card's name contains what was typed, the search offers the closest names as a line under
the box ("Did you mean **Lightning Bolt**? Or ..."); tapping one opens the card.

- Offline database: `lib/fuzzy.ts` (normalize: no accents/apostrophes; edit distance with neighbour
  swaps; 0 typos up to 3 letters, 1 up to 5, 2 up to 9, then 3; also matched against the START of
  longer names while typing (+0.5), and each face of split/double-faced cards; reprints whose face
  repeats a name are de-duplicated). `didYouMean()` in `lib/card-db.ts` builds the index once per
  database (~25 ms) and runs after a 200 ms typing pause (`useSettled`), ~2-20 ms per search on a PC.
  `searchDb` now returns `named` (any name contains the text, on screen or not) so an exact cube hit
  on the Look up tab never triggers a guess.
- No database: Scryfall's `/cards/named?fuzzy=` when autocomplete returns nothing
  (`scryfallFuzzyName`).
- Where: the life counter's Look up a card (both apps) and the Look up tab's other-cards box.

---

## ✅ Checklists (2026-11-07)

Ari, receiving the CubeOrdering orders: tick off cards coming in and cards going out, several
checklists, each keeping its progress. The My cube → Checklists page (route `/inventory`, was the
Collection checklist) lists:

- **Each uploaded cube's collection** (the old received/missing marks, `Inventory.tsx`, unchanged).
- **Checklists made here** (`lib/checklists.ts`, `components/Checklists.tsx`): a name plus where
  the cards come from. Cube review sources follow the decisions live (Coming in = Add, Going out =
  Cut, Maybes, The cube after changes, The cube as it is), so a new Add appears by itself and a
  tick stays with its card; or a pasted list of names (counts, set codes, `*F*` and section
  headers tolerated; keyed by front-face name, pictures from the Cube review cards, then the
  uploaded cubes).
- Per card: tap = got it, the flag = a problem (wrong printing, damaged, missing). Filters To do /
  Done / Problems / All, search, sort A–Z or by colour. Rename, Start over (clears that list only),
  Delete (a stamped tombstone).
- Stored as one stamped map (`l:<id>` lists, `m:<id>:<card>` marks) and synced per entry by the
  account sync (new kind `checklists` in `user-sync.ts` and `api/userdata.ts`), so ticking on two
  devices at once keeps both.

## ✅ Judge: game rules only, and a test set (2026-11-03)

Ari: the judge is for card interactions at the table, not tournament policy.

- **Scope.** The topic check (`api/_judge-guard.ts`) sorts questions into MAGIC / POLICY / OTHER.
  POLICY (penalties, infractions, MTR/IPG/JAR, REL) gets a fixed reply pointing at the event's
  judge, uses no ruling and isn't counted as a refusal. The judge's prompt has no tournament
  section; its web search is limited to magic.wizards.com (new sets' release notes, fresh bans).
- **Fixed on the way:** Haiku 5.5 thinks by default and used up the check's 5-token reply, so
  some real questions were refused as off-topic. Thinking off; only an explicit OTHER refuses.
- **Sources:** every official ruling on a card (was the newest 20), and the CR's table of
  contents in the prompt (`crIndex` in `api/_cr.ts`: sections plus keyword numbers), since
  numbers move between versions.
- **Test set:** `tests/judge-eval/questions.json`, 50 questions (10 marked `hard`: several cards
  or rules at once, a rule that changed recently, a follow-up that needs a new lookup), each with
  the facts a right answer must state, checked against the CR and current rulings. Free runs:
  Claude Code subagents given `scripts/print-judge-prompt.ts` and `scripts/judge-brief.ts`, graded
  by a separate subagent. Real-judge runs: `scripts/judge-eval.ts` (local handler, key in
  `.env.local`, `--budget` cap), only a handful at a time (Ari: ~$1). Results in `runs/`.
  First results: 40/40 free, 10/10 real ($0.57); the set was too easy, hence the hard batch.

---

## ✅ Life counter: names, partner commanders, the Enduring Story (2026-11-03)

For handing the counter to friends (Ari). All in the player's ⋯ menu:

- **Names.** The menu's header is a name field (blank = the seat's name: You/Opponent or P1-P6).
  `Player.name`, kept from game to game like the color; `playerName(game, i)` everywhere a seat
  is named, history lines included. Not a game action (no history entry).
- **Two commanders.** "My deck has two commanders" on a player's own menu (`Player.partners`,
  also kept game to game). Every opponent's commander-damage strip then shows a second sword
  (marked ²) for that seat, with its own count to 21: `Player.cmdr2[from]`, `changeCmdr(...,
  second)`, history entries carry `second` and never merge with the first commander's.
- **The Enduring Story** (storied: three permanents that are artifacts, Sagas and/or legendary):
  a marker like the city's blessing (`Player.story`, `setStory`, the rose book icon above the
  total, a toggle in the menu, a tracker switch in Settings).

- **Two custom counters** (same day): tickets and rad are gone (stripped from saved games in
  `parseGame`); in their place two *Custom* tiles. Tapping one opens a picker in the menu:
  presets (Treasure, Food, Clue, Blood, Map, Powerstone, Prowess) or any name with any of the
  symbols; `Game.custom[custom1|custom2] = {name, icon}`, kept for the next game like the poison
  symbol; `counterLabel()` / `counterIcon()` resolve them everywhere (card rows, menu, history).
  The grid stays even at eight. Energy now shows the official {E} symbol (Scryfall, inlined by
  `scripts/build-mana-symbols.mjs` like the mana pips) instead of a generic bolt.

- **Eliminated players** (same day): "Out of the game" in the ⋯ menu (`Player.out`, `setOut`, a
  history entry so undo works). The card dims, its life taps are off, an "Out of the game" pill
  sits above the total, opponents' commander-damage strips drop that seat, the monarch picker skips
  it, and going out releases the monarch or initiative if held (the rules pass it to the active
  player, whom the counter doesn't track). A new game starts everyone in.
- **Round timer** (same day): a clock in the tray (`Game.timer`, `startTimer`/`pauseTimer`/
  `resetTimer`/`setTimerLimit`, not in history). The sheet has start/pause/reset and a countdown
  (20/30/50/60 min, kept for the next game); while it runs a small pill under the middle button
  shows the time on every screen; a countdown turns red and buzzes once at zero and keeps counting
  past it. Settings switch `timer`.
- **Four custom slots** (same day): custom3/custom4 (off by default), Tickets and Rad as presets,
  Powerstone dropped.
- **The camera cutout** (same day, Ari asked for per-phone handling): the table is laid out below
  `env(safe-area-inset-top)` (every seat the same height, the middle button in the middle of them)
  and the top seats reach up behind the cutout on their own (`topEdge`: the card grows upward by
  the inset and pads its contents by the same). So every total sits the same distance from the
  middle button whatever the phone's cutout; a browser tab (inset 0) is unchanged. The web only
  ever learns the strip's height, not where the hole is; nothing matters in that strip anyway.

## Future / under consideration

### A. Rotisserie draft mode  *(REMOVED 2026-10-12 at Ari's request; kept below as history)*

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

### C. Life counter as its own store app  *(potential — researched 2026-10-29, not started)*

The idea: the life counter as a standalone app on Google Play and the App Store, with
a home screen ("New game": players, starting life, format) instead of opening inside
Booster Tutor. The Judge becomes a paid add-on (Ari's first guess: ~$5/month for ~100
rulings). Research notes, not a plan yet:

**Spinning it off is mostly packaging, not a rewrite.** The counter only depends on
`LifeCounter`, `LifePanel`, `lib/life.ts`, `dungeons`, `emblems`, `dice3d` (three.js),
`coin-art`, `Icon`, `Sheet`, `ManaCost`, `use-back-to-close`. Game state is already local.
Judge and card search are lazy-loaded and need the server (`api/judge`, `api/card-search`).
Likely shape: a second Vite entry in this repo, wrapped with Capacitor (same React code in
a native shell), plus native touches (keep-awake, haptics, orientation, status bar).

**Store work, roughly in order of effort:**
- *Accounts + payments* (only needed for the paid Judge): the invite-link/PIN sign-in
  isn't fit for the public. Needs real sign-in (Sign in with Apple if Google sign-in is
  offered), in-app account deletion (Apple 5.1.1(v)), in-app purchase for the
  subscription on both stores (Apple 3.1.1; RevenueCat is the usual shortcut), and the
  server checking the entitlement before each ruling.
- *iOS builds need a Mac* (or a cloud Mac: Codemagic / GitHub Actions macOS runners).
  Apple Developer $99/yr. Google Play $25 once.
- *Google Play, new personal account:* 12 testers opted in for 14 days of closed
  testing before production unlocks (organisation accounts are exempt but need a D-U-N-S).
- *Listing paperwork:* privacy policy URL, Apple privacy labels / Google data-safety
  form, age rating, screenshots. AI-specific: disclose that questions go to a
  third-party AI (Apple 5.1.2(i)), plus a way to report bad answers (Apple 1.2 / 4.7).
- Apple's "not just a website" rule (4.2) shouldn't bite: a life counter is app-like,
  and dozens are already listed (Lotus, Life Counter Magic, Dragon Counter...).

**Money:** the Judge costs ~7–12¢ per ruling on Opus 5.5, so 100 rulings ≈ $7–12 of API
spend against $5 minus the store's 15% (small-business rate) ≈ $4.25. As guessed, heavy
users lose money. Options: fewer rulings per tier (~30–40), a cheaper model for the paid
tier (test quality first), or credit packs. Comparables: MagicJudge (iOS) Pro plans
$7.99 / $14.99 / $29.99; StackCaster credit packs from $5; Ask Judge has a "Pro" tier.

**Legal (not legal advice — get a short IP-lawyer read before charging):**
- *Wizards Fan Content Policy:* fan content "must be free"; "You can't require payments
  ... subscriptions ... to access your Fan Content"; sponsorships, ads and donations are
  allowed; Wizards can revoke at any time. The Wizards Terms say the policy "only
  permits noncommercial activities". A paid Judge built on the Comprehensive Rules and
  Oracle text is the part that conflicts. Plenty of store apps charge anyway (unlocks,
  ad removal, AI judge plans), but that's tolerance, not permission.
- *Scryfall:* the data is free "under the Wizards Fan Content Policy" and may not be
  paywalled. Card search must stay free, image credits stay visible, and the app must
  add value beyond repackaging.
- *Trademarks:* no "MTG" / "Magic: The Gathering" or Wizards logos in the app name or
  icon (Apple 5.2.1 rejects these, and the Fan Content Policy bars logos/trademarks).
  Use our own name plus the unofficial-fan-content disclaimer.
- The life counter itself is low-risk: life totals and dice aren't Wizards IP. The
  Wizards material in it (mana symbols, emblem/dungeon text, "Monarch") is ordinary fan
  use as long as it's free.
- *Lowest-risk model:* everything free, including a monthly Judge allowance, with an
  optional supporter subscription/tip that raises the allowance (the Lotus / MTJudge
  pattern). Still ambiguous under "can't require payment to access", hence the lawyer read
  (or written permission from Wizards).

### D. Life counter home screen + settings  *(later — Ari, 2026-11-01; cube work comes first)*

Independent of the store app (item C), and a step towards it. Today the Life tab drops straight
into a game with everything switched on. Instead:

- **An opening screen**: *New game* (players, starting life) and *Settings*.
- **Settings choose which trackers a player wants**: dungeons / the initiative, day/night, the Ring,
  the city's blessing, emblems, monarch, commander damage, the counter list. Most people don't care
  about dungeons or day/night; their tray and ⋯ menu should only show what they picked. The defaults
  stay as they are now for Ari.
- Per device (localStorage), since guests aren't signed in; signed-in players could sync it later.
- Ties into **access**: people who get only the life counter need a thought-through experience, not
  the owner's. What to give them beyond the counter (Judge? card search?) is still to decide.

---

### E. LifeTutor: the life counter for friends  *(built 2026-11-02; live at lifetutorapp.vercel.app)*

Why: Ari wants to hand the counter to his friend group. Decided 2026-11-02, revised the same day:

- **A standalone life counter, nothing else.** LifeTutor shows the home screen, the table and
  Settings, and that's all, even to the owner. No packs, decks or cube tools inside it (an
  earlier version opened the whole guest app from the home screen; Ari didn't want that).
- **The counter is open to anyone.** No sign-in to play: nothing of Ari's is exposed and
  nothing costs him. The game in progress survives a reload (localStorage). Card lookup by
  name is in the tray for everyone (it only talks to Scryfall from the browser).
- **The judge is the one thing an invite unlocks.** Signed out, the tray still shows the Judge,
  locked: a box explains it and points at Settings. Signing in lives at the foot of Settings
  (paste the personal link, or the owner PIN; a `/join#token` link signs in on the spot), with
  "Signed in as … / Sign out" once in. Same accounts, invites and per-guest judge limits as
  Booster Tutor (shared Upstash store).
- **Settings is its own page** (gear top-right on the home screen): the tracker switches, then
  the counter switches (which player counters the ⋯ menu offers; one already on a card stays),
  then the judge section. The home screen is just the table, New game and a first-visit
  welcome, centred on the screen both ways (2026-11-03).
- **Second entry, same repo, its own Vercel project.** `src/lib/app-flavor.ts` reads `VITE_APP`;
  `main.tsx` loads `TableApp` (LifeTutor) or `BoosterTutor` (AuthGate + App); `vite.config.ts`
  picks the manifest and icons (`public/lifetutor-*.png`) the same way. Locally
  `npm run dev:table` (reads `.env.table`; the desktop app's `lifetutor-dev` entry, port 5188).
  The Vercel project `lifetutorapp` builds this repo with `VITE_APP=table`, the same
  `ANTHROPIC_API_KEY` / `EDIT_PIN`, and the existing Upstash store connected.
- **On a laptop, LifeTutor sits in a drawn phone** (Ari, 2026-11-02: to try it on the PC as it
  looks on a phone). `TableApp` renders a 412×915 iframe of itself inside a bezel, scaled to fit
  the window, whenever the window is wide and has a mouse; inside the iframe the app renders
  plainly (`window.self !== window.top`), so it's a real phone viewport and nothing in the
  counter needs to know. Same origin, so the game and settings are shared with the plain view.
- **Light mode** (Ari picked "option B" from a mock-up canvas, 2026-11-02): Settings > Appearance =
  Follow phone / Light / Dark (`lib/appearance.ts`, `data-theme` on <html>, key
  `booster-tutor-appearance-v1`; LifeTutor only, Booster Tutor stays dark). Light tokens in
  `index.css` under `:root[data-theme="light"]`; new tokens `--color-accent-ink` (text on an
  accent button), `--color-table` (gutters), `--color-tray` / `--color-tray-ink` (the bar and
  its icons). The seats keep their colours and white numbers; the round tray button is white in
  both modes, its ring takes the gutter colour and it has a soft shadow. The seat menu, the
  dungeon map, the Ring and the emblem screens are all on tokens too (Ari: light mode across
  everything), with `--color-gold` for the monarch / coin / Ring gold (darker in light mode) and
  the accent standing in for the old lavender on the dungeon map.
- Shared pieces: `components/SignIn.tsx` (the form, used by Booster Tutor's gate and LifeTutor's
  Settings), `takeLinkToken` in `lib/auth.ts`, `LifeHome` / `LifeSettingsPage` in
  `components/LifeHome.tsx` (Booster Tutor's Life tab opens on the same home screen, with a
  back arrow to the rest of the app and no judge section).

Not changing: the Fan Content position (everything stays free), the owner-only cube tools,
the existing guest/admin screens. Later: store packaging = item C (Capacitor around this
entry), only if the friends use it.

---

## Out of scope (still)

- Statistics / analytics.
- Authentication.
- ~~Multi-user / shared sessions~~ and ~~draft mode~~ — reconsidered; see item A.

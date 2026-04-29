# Booster Tutor — Roadmap

Captured 2026-04-29. Order is rough priority; not strict dependency.

---

## 1. Legal / fan-site disclaimer

Add a footer (and probably an `/about` link) with a Wizards Fan Content Policy
disclaimer + Scryfall image attribution.

**To research before drafting final wording:**
- Current Wizards of the Coast **Fan Content Policy** (as of 2026) — confirm
  what claims must be made and the exact phrasing they expect.
- **Scryfall API & image-use terms** — confirm attribution requirements.

**Likely shape (pending verification of current policies):**
- Footer note: "Booster Tutor is an unofficial fan-made tool for resolving the
  *Booster Tutor* card. Magic: The Gathering, its names, mana symbols, set
  symbols, and card images are property of Wizards of the Coast LLC. This site
  is not produced, endorsed, supported, or affiliated with Wizards of the
  Coast. Card data and images via [Scryfall](https://scryfall.com)."
- No revenue, no ads, no donations — keep it firmly non-commercial to stay
  within the fan-content carve-out.
- If we ever add accounts or paid features, this section needs a re-review.

---

## 2. Configurable pack size

- UI: numeric input or stepper next to the mode selector. Default 15.
- Sensible bounds: 1–40 (or 1–pool size).
- For Color-Balanced mode: scale the per-color targets proportionally
  (round to int, distribute remainders to multicolor + colorless), or fall
  back to "fill from largest bucket" logic that already exists.

---

## 3. Multiple cubes / user uploads

The biggest architectural shift. Today the cube is bundled at build time
(`src/data/cube.json`). Move to a model where the bundled cube is the default,
and users can upload their own.

**UX:**
- Cube selector dropdown in header ("Default Cube" / "<Custom name>").
- "Upload cube" button → file picker → text file (one card per line, same
  format as `scripts/cube-list.txt`).
- After upload: name the cube, then enrichment progress bar
  ("Fetching 412 of 540 from Scryfall…"). Card draws unlock when done.
- Per-cube session state (picked cards) — switching cubes preserves each
  cube's pool independently.

**Format parsing:**
- If a line includes `(SET) collector_number`, fetch that exact printing.
- If only the card name is given, use Scryfall's `/cards/named?fuzzy=` and
  take the default English non-art-variant printing.
- Always English (`lang=en`), default frame, no art variants.

**Storage:**
- localStorage is too small (~5 MB) for many enriched cubes. Use **IndexedDB**.
  Schema: `cubes` store keyed by ID, each holding the enriched card list +
  metadata (name, source, generated_at). `sessions` store keyed by cube ID
  holding `pickedCardIds`.
- Migrate the current `booster-tutor-state` localStorage key into the new
  per-cube session model, mapped to the bundled default cube.

**Scryfall calls from the browser:**
- Scryfall supports CORS, so direct fetches work (no backend needed).
- Same 50–100 ms rate limit applies. Throttle in a queue.
- Send a `User-Agent`-equivalent identifier in `Accept` / via documented
  Scryfall headers, per their guidance.
- Handle failures gracefully: a "review failed cards" step that lets the user
  manually pick a printing or skip. Cube can still be used with the cards
  that resolved.

---

## 4. Mobile-first picking UX

When the user taps a card from the open pack, instead of a confirmation modal:

- The tapped card scales up to a "spotlight" view that takes most of the
  viewport (rotated to fit if needed).
- The remaining 14 cards collapse to a smaller strip below the spotlight.
- Spotlight has two action buttons:
  - **Confirm pick** — adds to picked log, closes pack.
  - **Back** — deselects, returns to grid view.
- Tapping a different card in the strip swaps the spotlight.

This replaces the current modal, which is awkward on phones.

---

## 5. Pack-open flow: "this game" vs "new match"

Replace the single **Open Pack** button with two:

- **Open new pack in this game** — current behavior. Picked cards stay out of
  the pool. Resolves another Booster Tutor in the same game.
- **Open new pack in a new match** — clears the picked-cards log + session
  state for the active cube before opening the pack. (Equivalent to the
  current Reset → Open Pack sequence, but in one tap.)

Add a **help tooltip / icon** next to "new match" explaining: *"Booster Tutor
removes cards from your cube for the rest of the **match**, not forever. Use
this when you're starting a fresh match against a different opponent (or the
next round) and want the full cube available again."*

Keep the explicit **Reset** button for power-users who want to clear without
opening a pack.

---

## Out of scope (still)

- Power-Weighted mode (still needs tier tagging — separate sub-project).
- Multi-user / shared sessions.
- Draft mode.
- Statistics / analytics.
- Authentication.

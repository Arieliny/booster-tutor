import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { isOwner, requireUser } from "./_auth.js";
import { redis } from "./_redis.js";

/**
 * "Describe it" search: turn plain English ("a blue-white creature with an
 * enters ability") into a Scryfall query (c=wu t:creature o:"enters"). The
 * browser then runs the query against Scryfall itself and shows the query, so
 * it can be checked and edited.
 *
 *   POST /api/card-search { text } -> { query }
 *
 * Uses the small, cheap model (fractions of a cent per search, billed to the
 * owner's API key). Owner only for now, like Look up; capped per day anyway.
 */

const MODEL = "claude-haiku-5-5";
const DAILY_CAP = 300;

const SYSTEM = `You translate a Magic: The Gathering player's description of the cards they want into ONE Scryfall search query. Reply with the query only: no explanation, no quotes around the whole thing, no code fences.

Scryfall syntax you can use:
- Colors: c=wu (exactly white+blue), c>=r (red and maybe more), c<=bg (only these colors, colorless allowed), c=c (colorless), c=m (multicolored). id<=wu for commander color identity.
- Types: t:creature t:instant t:legendary t:"equipment" t:elf. Negate with -t:land.
- Rules text: o:"enters" o:flying o:"draw a card" o:/regex/. Use the card's own wording: "enters" (not ETB), "dies", "leaves the battlefield", "sacrifice", "create" + "token", "counter target", "destroy target", "exile target", "search your library", "add {" for mana producers.
- Keywords: kw:flying kw:haste kw:cascade.
- Numbers: mv<=3 (mana value), pow>=4, tou<=2, loy=3, mv=pow (comparisons between fields work).
- Rarity r:common r:uncommon r:rare r:mythic. Sets: s:dmu, e:lea. Year: year>=2020.
- Legality: f:modern f:legacy f:vintage f:pauper f:commander f:standard. banned:modern.
- Cards: is:split is:dfc is:mdfc is:vanilla is:french_vanilla is:commander is:reserved is:spell is:permanent.
- Tags (community-curated function tags, very useful): otag:removal otag:counterspell otag:ramp otag:card-advantage otag:board-wipe otag:tutor otag:burn otag:sweeper otag:discard otag:reanimation otag:blink otag:mana-rock otag:mana-dork.
- Price: usd<1. Combine with spaces (AND), "or" with parentheses: (o:"draw a card" or otag:card-advantage).

Guidelines:
- Prefer o:"..." with real Oracle wording; add an otag only when it clearly fits.
- "ETB"/"enters the battlefield" -> o:"enters". "Cantrip" -> o:"draw a card". "Removal" -> otag:removal.
- Don't add format, rarity or price filters the player didn't ask for.
- If the description is already a card name, return !"Card Name".
- If it's not about Magic cards at all, return the words as plain name search.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const me = await requireUser(req, res, isOwner);
    if (!me) return;
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 400) : "";
    if (!text) {
      res.status(400).json({ error: "Describe the card you're looking for." });
      return;
    }

    const key = `nlsearch:${me.id}:${new Date().toISOString().slice(0, 10)}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 2 * 24 * 60 * 60);
    if (n > DAILY_CAP) {
      res.status(429).json({ error: "That's a lot of searches today. Try again tomorrow." });
      return;
    }

    // Local tests without a key (scripts/dev-api.ts): a plain rules-text search.
    if (!process.env.ANTHROPIC_API_KEY || (process.env.BT_FAKE_REDIS && process.env.BT_FAKE_JUDGE)) {
      res.status(200).json({ query: `o:"${text.split(/\s+/).slice(-1)[0]}"`, stand_in: true });
      return;
    }

    const msg = await new Anthropic().messages.create({
      model: MODEL,
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: "user", content: text }],
    });
    const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const query = raw
      .replace(/^```[a-z]*\s*|\s*```$/g, "")
      .split("\n")[0]
      .replace(/^(query|scryfall)\s*:\s*/i, "")
      .trim();
    res.status(200).json({ query: query || text });
  } catch (err) {
    console.error("card-search error:", err);
    res.status(500).json({ error: "Couldn't turn that into a search right now. Try again, or search by name." });
  }
}

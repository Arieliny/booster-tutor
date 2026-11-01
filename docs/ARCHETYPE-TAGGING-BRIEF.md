# Archetype tagging brief

You are tagging Magic: The Gathering cards for a vintage-power cube (540 cards, singleton, fully powered:
Moxen, Lotus, Time Walk, Academy, Workshop, Tinker, Sneak Attack, Oath, LED, Breach, Doomsday...). Each card
gets the archetypes it belongs to, each with a role. The tags drive "how many cards support archetype X" counts
that the cube's owner uses to decide what to cut, so **precision matters more than coverage**: a wrong tag
inflates an archetype's count; a missing tag is easy to add later.

## Roles

- **P** payoff: the card the deck is built around, or what the deck is trying to do (Sneak Attack, Tolarian Academy,
  Thopter Foundry, Griselbrand for reanimator, Tendrils for storm, Monastery Mentor for spells).
- **E** enabler: makes the payoff work (Entomb, Dark Ritual, Goblin Welder, a looter for reanimator, a fetch land for
  lands-matter, a Mox for artifacts/storm).
- **F** fits: a good card for the deck that doesn't define it and could be in other decks too (Lightning Bolt in
  aggro, Counterspell in control, a gold card in good stuff). Use F sparingly; an archetype's F count only matters
  for "would this deck have enough playables", so tag F only when the card is clearly better in that deck than
  in a random one.

## Archetypes (key: what it is in this cube)

- `aggro`: RW / mono-W / mono-R aggro and weenie. Cheap efficient creatures, haste, anthems, burn, equipment
  (Stoneforge package: Jitte, Kaldra, Boots, Glimmer Lens), Thalia-style taxes. Treasure aggro (Ragavan, Magda) too.
- `artifacts`: Academy / Workshop / Urza / Tezzeret / Saheeli decks. Mana rocks, artifact creatures, Welder,
  Tinker targets, metalcraft, the Keys + Time Vault, Monoliths, Memory Jar, Karn, Ugin. Most mana rocks are
  `artifacts:E` and `storm:E`; the five Moxen, Lotus, Sol Ring, Mana Crypt are E for both.
- `reanimator`: cheating big creatures in: reanimation (Entomb, Reanimate, Animate Dead, Exhume, Necromancy,
  Persist, Unearth, Goryo's, Shallow Grave), cheat (Sneak Attack, Through the Breach, Flash, Show and Tell, Oath
  of Druids, Natural Order, Tinker), looting/discard that bins a fatty (Faithless Looting, Frantic Search,
  Seasoned Pyromancer, Tersa, Carnage Interpreter, landcyclers), and the fatties themselves (Griselbrand, Archon
  of Cruelty, Emrakul, Worldspine Wurm, Atraxa, Blightsteel, Triplicate Titan, Woodfall Primus, Vaultborn Tyrant,
  Portal to Phyrexia, Etali, Torsten...). Fatties are **P**; reanimation spells, cheat spells and looters are **E**.
- `ramp`: RG / mono-G beats and ramp: mana creatures (Elves, Birds, Hierarchs, Cobra, Fanatic of Rhonas), ramp
  payoffs (Questing Beast, Surrak, big hasty green/red things, Goldspan, Bonehoard, Vaultborn, Etali), Green Sun's
  Zenith, Natural Order as E.
- `control`: WU / mono-U control: counterspells, wraths (Balance, Sunfall, Deluge, Fiery Confluence, Parallax
  Wave), planeswalkers (Teferis, JTMS, Wandering Emperor), exile removal, card draw, Solitude / Subtlety,
  manlands, big finishers that end a long game.
- `storm`: rituals, LED, Lotus, Petal, Chrome Mox, Manamorphose, Yawgmoth's Will, Underworld Breach, Brain
  Freeze, Tendrils, the wheels (Timetwister, Wheel of Fortune, Echo of Eons, Time Spiral, Memory Jar), Bolas's
  Citadel, Paradoxical Outcome, Candelabra, Vivi, Witherbloom Apprentice / Sedgemoor Witch + Chain of Smog,
  Spellseeker, tutors (Demonic, Vampiric, Mystical, Imperial Seal, Wishclaw, Enlightened), Doomsday + Thassa's
  Oracle / Jace Wielder / Consultation / Tainted Pact, Frantic Search, cheap cantrips as E. Win conditions
  (Tendrils, Brain Freeze, Oracle, Citadel, Breach) are P; mana and tutors are E.
- `goodstuff`: 3–5 colour good stuff. Tag **fixing** (fetches, duals, shocks, Triomes, fast lands, Talismans,
  rainbow lands, Coalition Relic, Relic of Sauron, Prismatic Vista, Mana Confluence, Starting Town) as
  `goodstuff:E`, and three-plus-colour or domain/converge cards (Omnath, Atraxa, Leovold, Loot, Aragorn, Sin,
  Territorial Kavu, Prismatic Ending, Leyline Binding, Together as One) as `goodstuff:P`. Do NOT tag every
  strong card goodstuff:F; only cards whose value depends on playing many colours.
- `gw`: GW beats: +1/+1 counters and go-wide midrange (Luminarch Aspirant, Bristly Bill, Scythecat Cub,
  Ouroboroid, Walking Ballista, Hexdrinker, Figure of Fable, Arwen, Knight of Autumn, Guide of Souls, Enduring
  Innocence, Esika's Chariot, Torsten, Gaea's Cradle). Only tag cards that are specifically about counters or GW
  creature midrange; plain good green/white creatures are `aggro:F` or `ramp:F` instead.
- `lands`: lands matter: Fastbond, Crucible, Ramunap, Icetill Explorer, Titania, Zuran Orb, Sylvan Safekeeper,
  Baloth Prime, Wrenn and Six, Lotus Cobra, landfall (Bristly Bill, Scythecat Cub, Springheart Nantuko, Tireless
  Tracker, Omnath), Uro, Six, Strip Mine, Wasteland, Gaea's Cradle, Nissa, Candelabra, Shifting Woodland, land
  tutors (Environmental Scientist, Sowing Mycospawn, Expedition Map), Life // Death, Orcish Lumberjack, Rain of
  Filth, Urborg, Yavimaya, manlands with sacrifice value. **Fetch lands are `lands:E`** (they trigger landfall
  twice and fill the yard); ordinary dual lands are not.
- `graveyard`: graveyard value / delirium: the Goyfs, DRC, Unholy Heat, Fear of Missing Out, Six, Keen-Eyed
  Curator, Emperor of Bones, Lion Sash, Deathrite, Uro / Phlage / Bloodbraid Challenger (escape), Abhorrent
  Oculus, Psychic Frog, Malevolent Rumble, Currency Converter, Cabal Ritual (threshold), delve (Treasure Cruise,
  Dig), Snapcaster, Jace VP, Eternal Witness, Kolaghan's Command, Serra Paragon, Lurrus, Yawgmoth's Will, Breach.
  Different from reanimator: it wants card types in the yard, not one fatty. Self-mill / looting / fetches /
  cheap spells that fill the yard are E.
- `tokens`: tokens & sacrifice (aristocrats): token makers (Elspeth Storm Slayer, Staff of the Storyteller,
  Lingering Souls, Forth Eorlingas!, Sanguine Evangelist, Jacked Rabbit, Adeline, Hero of Bladehold, Ocelot Pride,
  Pest Infestation, Esika's Chariot, Rabblemaster, Mentor, Third Path Iconoclast, Saheeli, Ravenous Robots,
  Pinnacle Emissary, Cori-Steel Cutter, Retrofitter Foundry, Thopter Foundry + Sword), sacrifice outlets and
  payoffs (Goblin Bombardment, Gut, Broadside Bombardiers, Bloodtithe Harvester, Bone Shards, Skullclamp), anthems
  and go-wide payoffs (Guide of Souls, Enduring Innocence, Gaea's Cradle, Elspeth).
- `spells`: spells matter / prowess (UR, WU, mono-U): Monastery Mentor, Third Path Iconoclast, Saheeli,
  Stormchaser's Talent, DRC, Cori-Steel Cutter, Sedgemoor Witch, Witherbloom Apprentice, Displacer Kitten,
  Cosmogrand Zenith, Sage of the Skies, Vivi, Lutri, Expressive Iteration, Traumatic Critique, Manamorphose,
  cheap cantrips (Brainstorm, Ponder, Preordain, Consider, Gitaxian Probe), Snapcaster, Jace VP, burn. The fair
  version of storm. Payoffs (Mentor, Iconoclast, Kitten) are P; cantrips and cheap interaction are E or F.
- `blink`: blink / enters-the-battlefield value: flicker effects (Flickerwisp, Phelia, Touch the Spirit Realm,
  Displacer Kitten, Parallax Wave, Aang) are P; strong ETB creatures (the evoke elementals Solitude / Fury / Grief
  / Endurance / Subtlety, Skyclave Apparition, Eternal Witness, Flametongue Kavu, Palace Jailer, Thraben
  Inspector, Stoneforge, Spellseeker, Trinket Mage, Baleful Strix, Loran, Knight of Autumn, Wan Shi Tong,
  Quantum Riddler, Deceit, Wistfulness, Archon of Cruelty, Atraxa, Woodfall Primus, Alpha Deathclaw) are E.
- `tempo`: UB / mono-U tempo and evasion: Kaito, Fallen Shinobi (ninjutsu), Psychic Frog, Suspicious Stowaway,
  Malcolm, Dauthi Voidwalker, Baleful Strix, True-Name Nemesis, Enduring Curiosity, Raffine, Flitterwing
  Nuisance, Creeping Tar Pit, Brazen Borrower, Faerie Mastermind, Glen Elendra, cheap counters (Daze, Spell
  Pierce, Stern Scolding, Memory Lapse, Remand), cheap discard and removal (Thoughtseize, Fatal Push, Cut Down).
- `initiative`: the initiative / monarch package: White Plume Adventurer, Seasoned Dungeoneer, Caves of Chaos
  Adventurer, Undermountain Adventurer, Feywild Caretaker, Passageway Seer, From the Catacombs, Palace Jailer,
  Emberwilde Captain, Aragorn, any other card that takes the initiative or makes you the monarch. All P.
- `wheels`: wheels & draw punishment: Orcish Bowmasters, Narset, Hullbreacher, Sheoldred the Apocalypse,
  Leovold, Faerie Mastermind (P: the punishers) + the wheels themselves (Timetwister, Wheel of Fortune, Echo of
  Eons, Time Spiral, Memory Jar, Coveted Jewel, Palantír, Together as One, Dack's +1) as E.

## Rules

1. 0 to 3 tags per card. Many cards get **zero** tags (a plain removal spell, a basic creature with no
   synergy): that's correct, don't force one. Generic removal and card draw get no tag unless it's
   specifically good in one archetype (a cheap counter in `tempo`, a wrath in `control`).
2. Use only the keys above, exactly as written. Roles are exactly P, E or F.
3. Judge each card by its text and what the cube's decks want, not by its general power level. Black Lotus
   is `storm:E`, `artifacts:E` (and nothing else); Swords to Plowshares is `control:F`, `aggro:F` at most.
4. Dual lands, shocks, fetches, Triomes, fast lands, Talismans: `goodstuff:E`, plus `lands:E` for fetches
   (and for anything that sacrifices itself or returns lands). Nothing else for plain fixing.
5. A card that fits two archetypes gets both (Tolarian Academy: `artifacts:P`, `storm:E`). A card listed as
   an example above should get at least that tag.
6. Cards from other cubes (in: lsv / mtgo / arena) are tagged the same way, as if they were in this cube,
   because the owner uses these tags to find cards worth adding.

## Output

Write a JSON object to the output path you were given: card name (exactly as given after `### `) → array of
`"key:ROLE"` strings, e.g.

```json
{
  "Black Lotus": ["storm:E", "artifacts:E"],
  "Griselbrand": ["reanimator:P"],
  "Swords to Plowshares": ["control:F", "aggro:F"],
  "Serra Angel": []
}
```

Include **every** card from your batch, with `[]` for no tags. No commentary in the file. Validate it parses
before you finish.

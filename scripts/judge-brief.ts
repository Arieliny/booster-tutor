/**
 * The judge's `brief` lookup from the command line: the same card and rules
 * lookups the live judge makes (api/judge.ts runBrief), printed as the judge
 * sees them. For checking the judge test set (tests/judge-eval/) and for
 * running its questions without the API.
 *
 *   npx tsx scripts/judge-brief.ts '{"cards":["Blood Moon"],"rules":["613.1"]}'
 *
 * Fields as the brief tool takes them: cards, search, rules, refs, glossary,
 * legality. Uses an in-memory Redis, so nothing touches production.
 */
import tls from "node:tls";

// This machine needs the Windows certificate store for Scryfall (see scripts/dev-api.ts).
try {
  tls.setDefaultCACertificates([...tls.getCACertificates("default"), ...tls.getCACertificates("system")]);
} catch {
  // Older Node: run with `node --use-system-ca` instead.
}
process.env.BT_FAKE_REDIS = "1";

const { runBrief } = await import("../api/judge.js");
const { loadCr } = await import("../api/_cr.js");

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: npx tsx scripts/judge-brief.ts \'{"cards":["Blood Moon"],"search":"layer"}\'');
  process.exit(1);
}
console.log(await runBrief(JSON.parse(arg), await loadCr()));

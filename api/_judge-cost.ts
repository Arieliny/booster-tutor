import type { Usage } from "@anthropic-ai/sdk/resources/messages/messages";

/**
 * What the judge costs, estimated from Anthropic's published list prices
 * (US dollars per million tokens). Shown to the owner only: per answer in the
 * Judge, per person per month in Admin. The real bill is in the Anthropic
 * Console; this tracks it closely but won't match to the cent.
 *
 * Update these if the models or prices change. Stored months are priced at
 * today's rates, so a model change re-prices older months too.
 */
const PRICES = {
  // The judge (prompt caching uses the default 5-minute cache: writes 1.25x input).
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  // The Magic-only gatekeeper (prompts are far under Haiku's 100K-token price step).
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
} as const;

export type PricedModel = keyof typeof PRICES;

/** Each web search the judge runs. */
export const WEB_SEARCH_DOLLARS = 0.01;

export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export function tokensOf(u: Usage): TokenCounts {
  return {
    input: u.input_tokens,
    output: u.output_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };
}

export function dollarsFor(model: PricedModel, t: TokenCounts, searches = 0): number {
  const p = PRICES[model];
  return (t.input * p.input + t.output * p.output + t.cacheRead * p.cacheRead + t.cacheWrite * p.cacheWrite) / 1e6 + searches * WEB_SEARCH_DOLLARS;
}

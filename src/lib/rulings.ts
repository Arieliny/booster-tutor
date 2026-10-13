import { useEffect, useState } from "react";

/**
 * Official card rulings from Scryfall, kept on this device so a card you've
 * opened once still shows its rulings offline. Rulings belong to the card
 * (Oracle ID), not the printing, so any printing's Scryfall id fetches them.
 */

export interface Ruling {
  date: string;
  text: string;
}

type Cache = Record<string, { at: number; rulings: Ruling[] }>;

const KEY = "booster-tutor-rulings-v1";
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CARDS = 500;

/** Parsed once per page load; writes keep it in step. */
let memo: Cache | null = null;

function readCache(): Cache {
  if (memo) return memo;
  try {
    memo = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Cache;
  } catch {
    memo = {};
  }
  return memo;
}

function writeCache(c: Cache): void {
  memo = c;
  try {
    const entries = Object.entries(c);
    // Keep the most recently fetched cards when it grows past the cap.
    const kept = entries.length > MAX_CARDS ? entries.sort((a, b) => b[1].at - a[1].at).slice(0, MAX_CARDS) : entries;
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage full or blocked: rulings still show this session.
  }
}

async function fetchRulings(sid: string, signal: AbortSignal): Promise<Ruling[]> {
  const res = await fetch(`https://api.scryfall.com/cards/${sid}/rulings`, { signal });
  if (!res.ok) throw new Error(`Scryfall returned ${res.status}`);
  const j = (await res.json()) as { data?: { published_at: string; comment: string }[] };
  return (j.data ?? []).map((r) => ({ date: r.published_at, text: r.comment }));
}

export type RulingsState =
  | { kind: "loading" }
  | { kind: "ready"; rulings: Ruling[] }
  | { kind: "unavailable"; offline: boolean };

/** A card's rulings: saved copy first, refreshed from Scryfall when it's a week old. */
export function useRulings(sid: string | undefined, oracleId: string): RulingsState {
  const [fetched, setFetched] = useState<{ id: string; state: RulingsState } | null>(null);
  const saved = readCache()[oracleId];

  useEffect(() => {
    if (!sid) return;
    const hit = readCache()[oracleId];
    if (hit && Date.now() - hit.at < FRESH_MS) return;
    if (!navigator.onLine) return;
    const ac = new AbortController();
    fetchRulings(sid, ac.signal).then(
      (rulings) => {
        writeCache({ ...readCache(), [oracleId]: { at: Date.now(), rulings } });
        setFetched({ id: oracleId, state: { kind: "ready", rulings } });
      },
      () => {
        if (!ac.signal.aborted) setFetched({ id: oracleId, state: { kind: "unavailable", offline: !navigator.onLine } });
      },
    );
    return () => ac.abort();
  }, [sid, oracleId]);

  if (fetched?.id === oracleId) return fetched.state.kind === "unavailable" && saved ? { kind: "ready", rulings: saved.rulings } : fetched.state;
  if (saved) return { kind: "ready", rulings: saved.rulings };
  if (!sid || !navigator.onLine) return { kind: "unavailable", offline: !navigator.onLine };
  return { kind: "loading" };
}

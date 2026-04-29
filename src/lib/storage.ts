import type { PersistedState } from "../types";

const STORAGE_KEY = "booster-tutor-state";

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { pickedCardIds: [], lastUpdated: new Date().toISOString() };
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.pickedCardIds)) throw new Error("invalid state");
    return parsed;
  } catch {
    return { pickedCardIds: [], lastUpdated: new Date().toISOString() };
  }
}

export function saveState(state: PersistedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

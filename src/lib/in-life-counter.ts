import { createContext } from "react";

/**
 * Screens shown inside the life counter (its Judge and card search pop-ups)
 * sit over a full-screen overlay, so anything that would leave the game or
 * open behind it has to behave differently there.
 */

/** Inside the life counter: links that open other parts of the app are hidden. */
export const InLifeCounterContext = createContext(false);

/**
 * Where a card's "Ask the judge about this card" goes. Normally the Judge
 * screen; inside the life counter, its Judge pop-up (so the game stays open).
 */
export const AskJudgeContext = createContext<(() => void) | null>(null);

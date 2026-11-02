/**
 * Which app this build is. The same code ships as two apps:
 *   - Booster Tutor (the default): invite-only, everything.
 *   - LifeTutor (`VITE_APP=table`, or `vite --mode table` via .env.table): the
 *     life counter for anyone, with Booster Tutor behind an invite.
 * Vercel builds each from its own project on this repo; see ROADMAP item E.
 */
export const IS_TABLE_APP = import.meta.env.VITE_APP === "table";

export const APP_NAME = IS_TABLE_APP ? "LifeTutor" : "Booster Tutor";

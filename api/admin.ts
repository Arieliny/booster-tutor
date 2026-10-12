import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  FEATURES,
  allUsers,
  createInvite,
  createUser,
  deleteUser,
  getUser,
  hasPendingInvite,
  isFeature,
  isOwner,
  requireUser,
  revokeSessions,
  saveUser,
  sessionCount,
} from "./_auth.js";
import { DEFAULT_GUEST_LIMIT, usageFor } from "./_judge-usage.js";

/**
 * Admin (owner only): people and what they can use.
 *
 *   GET  /api/admin -> { features, defaultJudgeLimit, users: [{ ...user, devices, lastSeen, pendingLink, judge }] }
 *   POST /api/admin
 *     { action: "create", name, features }  -> { user, token }   new guest + their link
 *     { action: "update", id, name?, features?, judgeLimit? }   judgeLimit null = default
 *     { action: "link", id }                -> { token }         new one-time link (replaces any unused one)
 *     { action: "signOutEverywhere", id }
 *     { action: "remove", id }              guests only
 *
 * Links are returned as raw tokens; the browser builds the URL, so the link
 * always points at whichever domain the owner is using.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const me = await requireUser(req, res, isOwner);
    if (!me) return;

    if (req.method === "GET") {
      const users = await allUsers();
      const rows = await Promise.all(
        users.map(async (u) => {
          const s = await sessionCount(u.id);
          return {
            ...u,
            devices: s.count,
            lastSeen: s.lastSeen,
            pendingLink: await hasPendingInvite(u.id),
            judge: await usageFor(u),
          };
        }),
      );
      rows.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "owner" ? -1 : 1));
      res.status(200).json({ features: FEATURES, defaultJudgeLimit: DEFAULT_GUEST_LIMIT, users: rows });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
    const features = Array.isArray(body.features) ? [...new Set(body.features.filter(isFeature))] : null;

    if (body.action === "create") {
      if (!name) {
        res.status(400).json({ error: "Give them a name." });
        return;
      }
      const user = await createUser(name, "guest", features ?? []);
      res.status(200).json({ user, token: await createInvite(user.id) });
      return;
    }

    const id = typeof body.id === "string" ? body.id : "";
    const target = id ? await getUser(id) : null;
    if (!target) {
      res.status(404).json({ error: "No such person." });
      return;
    }

    if (body.action === "update") {
      if (name) target.name = name;
      // The owner always has everything; only guests' access is editable.
      if (features && target.role === "guest") target.features = features;
      if (body.judgeLimit === null) delete target.judgeLimit;
      else if (typeof body.judgeLimit === "number" && Number.isFinite(body.judgeLimit))
        target.judgeLimit = Math.max(0, Math.min(500, Math.round(body.judgeLimit)));
      await saveUser(target);
      res.status(200).json({ user: target });
      return;
    }
    if (body.action === "link") {
      res.status(200).json({ token: await createInvite(target.id) });
      return;
    }
    if (body.action === "signOutEverywhere") {
      await revokeSessions(target.id);
      res.status(200).json({ ok: true });
      return;
    }
    if (body.action === "remove") {
      if (target.role === "owner") {
        res.status(400).json({ error: "The owner can't be removed." });
        return;
      }
      await deleteUser(target.id);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: `Unknown action: ${String(body.action)}` });
  } catch (err) {
    console.error("admin handler error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

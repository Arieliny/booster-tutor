import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  checkOwnerPin,
  createUser,
  currentUser,
  endSession,
  getUser,
  ownerId,
  publicUser,
  redeemInvite,
  startSession,
} from "./_auth.js";

/**
 * Sign-in.
 *
 *   GET  /api/auth                          -> { user: PublicUser | null }
 *   POST /api/auth { action: "redeem", token } -> sign in with a one-time link
 *   POST /api/auth { action: "owner", pin }    -> owner sign-in with EDIT_PIN
 *   POST /api/auth { action: "signout" }       -> end this device's session
 *
 * The very first owner sign-in creates the owner account.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const user = await currentUser(req);
      res.status(200).json({ user: user ? publicUser(user) : null });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;

    if (body.action === "redeem") {
      if (typeof body.token !== "string" || body.token.length < 20) {
        res.status(400).json({ error: "That sign-in link isn't valid." });
        return;
      }
      const userId = await redeemInvite(body.token);
      if (!userId) {
        res.status(410).json({ error: "That sign-in link has already been used or has expired. Ask for a new one." });
        return;
      }
      await startSession(res, userId);
      const user = await getUser(userId);
      res.status(200).json({ user: user ? publicUser(user) : null });
      return;
    }

    if (body.action === "owner") {
      const pin = await checkOwnerPin(req, body.pin);
      if (!pin.ok) {
        res.status(pin.status).json({ error: pin.error });
        return;
      }
      let id = await ownerId();
      if (!id || !(await getUser(id))) id = (await createUser("Ari", "owner", [])).id;
      await startSession(res, id);
      const user = await getUser(id);
      res.status(200).json({ user: user ? publicUser(user) : null });
      return;
    }

    if (body.action === "signout") {
      await endSession(req, res);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: `Unknown action: ${String(body.action)}` });
  } catch (err) {
    console.error("auth handler error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

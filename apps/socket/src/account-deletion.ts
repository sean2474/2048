import type { IncomingMessage, ServerResponse } from "node:http";
import { clientAddress } from "./client-address";

export type DeleteAccount = (userId: string, confirmationEmail: string, accessToken: string) => Promise<void>;

export function accountDeletionHandler(options: {
  origins: string[];
  resolveAccount?: (token: string) => Promise<{ id: string }>;
  deleteAccount?: DeleteAccount;
  deleting: Set<string>;
  isPlaying: (id: string) => boolean;
  hasPending: (id: string) => boolean;
  disconnect: (id: string) => void;
}) {
  const attempts = new Map<string, { count: number; expires: number }>();
  return async (req: IncomingMessage, res: ServerResponse) => {
    const reply = (status: number, error?: string) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(error ? { error } : { ok: true }));
    };
    const origin = req.headers.origin;
    if (origin && !options.origins.includes(origin)) { reply(403, "origin_not_allowed"); return; }
    if (origin) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "POST");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.writeHead(204); res.end(); return;
    }
    if (req.method !== "POST") { reply(405, "method_not_allowed"); return; }
    const now = Date.now(), address = clientAddress(req);
    for (const [ip, attempt] of attempts) if (attempt.expires <= now) attempts.delete(ip);
    let attempt = attempts.get(address);
    if (!attempt) {
      if (attempts.size >= 1024) { reply(429, "too_many_requests"); return; }
      attempt = { count: 0, expires: now + 60_000 }; attempts.set(address, attempt);
    }
    if (++attempt.count > 20) { res.setHeader("Retry-After", "60"); reply(429, "too_many_requests"); return; }
    if (!options.resolveAccount || !options.deleteAccount) { reply(503, "deletion_unavailable"); return; }
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token || token.length > 8192) { reply(401, "authentication_required"); return; }
    if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json") { reply(400, "invalid_request"); return; }
    let lockedId: string | undefined;
    try {
      req.setTimeout(10_000, () => req.destroy());
      req.setEncoding("utf8");
      let raw = "";
      for await (const chunk of req) {
        raw += chunk.toString();
        if (Buffer.byteLength(raw) > 2048) { reply(413, "invalid_request"); return; }
      }
      let body: unknown;
      try { body = JSON.parse(raw); } catch { reply(400, "invalid_request"); return; }
      if (!body || typeof body !== "object" || !("confirmationEmail" in body) || typeof body.confirmationEmail !== "string" || body.confirmationEmail.length > 320) {
        reply(400, "invalid_request"); return;
      }
      const account = await options.resolveAccount(token).catch(() => null);
      if (!account) { reply(401, "authentication_required"); return; }
      if (options.deleting.has(account.id)) { reply(409, "deletion_in_progress"); return; }
      options.deleting.add(account.id); lockedId = account.id;
      if (options.isPlaying(account.id)) { reply(409, "active_match"); return; }
      if (options.hasPending(account.id)) { reply(409, "pending_result"); return; }
      // Cancel outstanding matchmaking callbacks before the first deletion await.
      options.disconnect(account.id);
      await options.deleteAccount(account.id, body.confirmationEmail, token);
      reply(200);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "confirmation_mismatch") reply(400, code);
      else if (code === "admin_account") reply(409, code);
      else reply(503, "deletion_failed");
    } finally {
      if (lockedId) options.deleting.delete(lockedId);
    }
  };
}

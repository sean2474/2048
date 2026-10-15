import type { IncomingMessage, ServerResponse } from "node:http";
import { FeedbackInputSchema, type FeedbackInput } from "schema/feedback";
import { clientAddress } from "./client-address";

export type FeedbackWriter = (input: FeedbackInput, reporterId: string | null) => Promise<void>;

export function feedbackHandler(options: {
  origins: string[];
  writeFeedback?: FeedbackWriter;
  resolveAccount?: (token: string) => Promise<{ id: string }>;
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
    const now = Date.now();
    const address = clientAddress(req);
    for (const [ip, attempt] of attempts) if (attempt.expires <= now) attempts.delete(ip);
    let attempt = attempts.get(address);
    if (!attempt) {
      if (attempts.size >= 1024) { reply(429, "too_many_requests"); return; }
      attempt = { count: 0, expires: now + 60_000 }; attempts.set(address, attempt);
    }
    if (++attempt.count > 5) { res.setHeader("Retry-After", "60"); reply(429, "too_many_requests"); return; }
    if (!options.writeFeedback) { reply(503, "feedback_unavailable"); return; }
    if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json") { reply(400, "invalid_request"); return; }
    try {
      req.setTimeout(10_000, () => req.destroy());
      req.setEncoding("utf8");
      let raw = "";
      for await (const chunk of req) {
        raw += chunk.toString();
        if (Buffer.byteLength(raw) > 16_384) { reply(413, "invalid_request"); return; }
      }
      let body: unknown;
      try { body = JSON.parse(raw); } catch { reply(400, "invalid_request"); return; }
      const input = FeedbackInputSchema.safeParse(body);
      if (!input.success) { reply(400, "invalid_request"); return; }
      let reporterId: string | null = null;
      if (req.headers.authorization) {
        const token = req.headers.authorization.match(/^Bearer (\S+)$/)?.[1];
        if (!token || token.length > 8192 || !options.resolveAccount) { reply(401, "authentication_required"); return; }
        const account = await options.resolveAccount(token).catch(() => null);
        if (!account) { reply(401, "authentication_required"); return; }
        reporterId = account.id;
      }
      await options.writeFeedback(input.data, reporterId);
      reply(201);
    } catch { reply(503, "feedback_unavailable"); }
  };
}

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AdminOperations, ResultStoreDiagnostics } from 'schema/admin';
import { playerSockets, rooms, matchmakingQueue, waitingByCode } from './state';
import { clientAddress } from './client-address';

export function operationsHandler(options: { checkAdmin?: (token: string) => Promise<boolean>; readStore?: () => ResultStoreDiagnostics }, startedAt: string) {
  const attempts = new Map<string, { count: number; expires: number }>();
  return async (req: IncomingMessage, res: ServerResponse) => {
    const reply = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    if (req.method !== 'GET') return reply(405, { error: 'method_not_allowed' });
    const token = req.headers.authorization?.match(/^Bearer ([^\s]{1,8192})$/)?.[1];
    if (!token) return reply(401, { error: 'authentication_required' });
    if (!options.checkAdmin) return reply(503, { error: 'admin_auth_not_configured' });
    const now = Date.now(), address = clientAddress(req);
    for (const [ip, attempt] of attempts) if (attempt.expires <= now) attempts.delete(ip);
    let attempt = attempts.get(address);
    if (!attempt) {
      if (attempts.size >= 1024) { res.setHeader('Retry-After', '60'); return reply(429, { error: 'too_many_requests' }); }
      attempt = { count: 0, expires: now + 60_000 }; attempts.set(address, attempt);
    }
    if (++attempt.count > 20) { res.setHeader('Retry-After', '60'); return reply(429, { error: 'too_many_requests' }); }
    try {
      if (!await options.checkAdmin(token)) return reply(403, { error: 'admin_access_required' });
      const now = Date.now();
      const roomCounts = { ready: 0, playing: 0, reconnecting: 0 };
      for (const room of rooms.values()) if (room.open) {
        if (room.pausedAt !== undefined) roomCounts.reconnecting++;
        else if (room.ready.size < room.players.length) roomCounts.ready++;
        else roomCounts.playing++;
      }
      const queue = (mode: 'casual' | 'ranked') => {
        const entries = matchmakingQueue.filter(entry => entry.mode === mode);
        return { count: entries.length, oldestWaitMs: entries.reduce((oldest, entry) => Math.max(oldest, now - entry.joinedAt), 0) };
      };
      const snapshot: AdminOperations = { startedAt, collectedAt: new Date(now).toISOString(), sessions: playerSockets.size,
        rooms: roomCounts, queues: { casual: queue('casual'), ranked: queue('ranked'), friend: waitingByCode.size }, storage: options.readStore?.() ?? null };
      reply(200, snapshot);
    } catch { reply(503, { error: 'admin_verification_unavailable' }); }
  };
}

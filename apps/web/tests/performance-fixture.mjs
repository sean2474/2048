import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

export const PLAYER = '10000000-0000-4000-8000-000000000099';
export const RIVAL = '10000000-0000-4000-8000-000000000098';
export const MATCH = '33333333-3333-4333-8333-333333333333';
const SEASON = '11111111-1111-4111-8111-111111111111';
const created = '2026-10-01T00:00:00Z';
export const fixtureUser = id => ({ id, aud: 'authenticated', role: 'authenticated', email: 'benchmark@example.invalid', is_anonymous: false, app_metadata: {}, user_metadata: {}, created_at: created });
export function fixtureSession(id = PLAYER) {
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: id, exp, role: 'authenticated' })).toString('base64url'), 'fixture'].join('.');
  return { access_token: token, refresh_token: 'fixture', expires_at: exp, expires_in: 86400, token_type: 'bearer', user: fixtureUser(id) };
}
export function fixtureCookies(origin, app, id = PLAYER) {
  return [{ name: app === 'admin' ? 'sb-2048-admin-auth' : 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(fixtureSession(id))).toString('base64url')}`, url: origin }, { name: 'duo.locale', value: 'en', url: origin }];
}

// Loopback fixture only. No environment keys or external database clients are loaded.
export async function startPerformanceFixture({ root, webPort, adminPort, apiPort, socketPort }) {
  const require = createRequire(resolve(root, 'apps/socket/package.json'));
  const requireTs = require('tsx/cjs/api').require;
  const load = path => requireTs(resolve(root, path), import.meta.url);
  const { createGameServer } = load('apps/socket/src/server.ts');
  const { SKINS } = load('packages/schema/loadout.ts');
  const { PROFILE_ICONS } = load('packages/schema/profile-icons.ts');
  const { ACHIEVEMENT_REWARDS, achievementForItem } = load('packages/schema/achievements.ts');
  const { SHOP_ITEMS } = load('packages/schema/economy.ts');
  const common = { status: 'published', publishedOnce: true, revision: 1, updatedAt: created, sortOrder: 0, description: '' };
  const acquisition = (kind, id) => { const price = SHOP_ITEMS.find(item => item.kind === kind && item.id === id)?.price ?? 0; return { price, acquisition: achievementForItem(kind, id) ? 'achievement' : price ? 'coins' : 'free' }; };
  const catalog = { skins: SKINS.map(item => ({ ...common, ...item, ...acquisition('skin', item.id) })), profileIcons: PROFILE_ICONS.map(item => ({ ...common, ...item, ...acquisition('icon', item.id), imagePath: `profiles/${item.id}.svg` })), achievements: ACHIEVEMENT_REWARDS.map(item => ({ ...common, ...item })) };
  const rating = { player_id: PLAYER, display_name: 'Benchmark Player', rating: 1400, wins: 9, losses: 1, draws: 0, games_played: 10, highest_score: 2048, highest_tile: 512, season_id: SEASON, tier: 'Platinum', placement_games: 10, peak_rating: 1605, rank_seasons: { name: 'Benchmark season' } };
  const player = { id: PLAYER, name: 'Benchmark Player', username: 'benchmark', email: 'benchmark@example.invalid', createdAt: created, suspendedAt: null, suspensionReason: null, rating: 1400, gamesPlayed: 10, wins: 9, losses: 1, draws: 0, isAdmin: true, tier: 'Platinum', placementGames: 10 };
  const telemetry = { moves: 12, charged: { xblock: 0, hardblock: 0 }, sent: { xblock: 0, hardblock: 0 }, received: { xblock: 0, hardblock: 0 } };
  const match = { id: MATCH, startedAt: created, endedAt: '2026-10-01T00:01:00Z', mode: 'ranked', reason: 'surrender', durationSeconds: 60, participants: [PLAYER, RIVAL].map((id, i) => ({ slot: i + 1, playerId: id, name: i ? 'Benchmark Rival' : player.name, score: 256, maxTile: 64, result: i ? 'loss' : 'win', ratingBefore: 1400, ratingAfter: 1400, ratingDelta: 0, telemetry })) };
  const operations = { startedAt: created, collectedAt: new Date().toISOString(), sessions: 2, rooms: { ready: 0, playing: 1, reconnecting: 0 }, queues: { casual: { count: 0, oldestWaitMs: 0 }, ranked: { count: 0, oldestWaitMs: 0 }, friend: 0 }, storage: { pending: [], pendingCount: 0, blockedRankedAccounts: 0, lastRemoteSuccessAt: new Date().toISOString(), readErrorAt: null, writeErrorAt: null } };
  const requests = [], unknown = [], matches = [];
  const api = createServer(async (request, response) => {
    response.setHeader('access-control-allow-origin', '*'); response.setHeader('access-control-allow-headers', '*'); response.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    const url = new URL(request.url, 'http://127.0.0.1');
    requests.push({ path: url.pathname, method: request.method, at: performance.now() });
    let id;
    try { id = JSON.parse(Buffer.from(request.headers.authorization?.split('.')[1] ?? '', 'base64url').toString()).sub; } catch { /* Guest request. */ }
    try {
      if (url.pathname.startsWith('/storage/v1/object/public/catalog-assets/profiles/')) {
        const filename = url.pathname.split('/').pop(); assert.match(filename, /^[a-z0-9-]+\.svg$/);
        response.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' }); response.end(await readFile(resolve(root, 'apps/web/public/profile-icons', filename))); return;
      }
      const name = url.pathname.split('/').pop();
      let data;
      if (url.pathname === '/auth/v1/user') data = fixtureUser(id ?? PLAYER);
      else if (url.pathname === '/auth/v1/token') data = fixtureSession();
      else if (url.pathname === '/auth/v1/logout') data = {};
      else if (url.pathname === '/health') data = { ok: true };
      else if (url.pathname === '/admin/operations') data = operations;
      else if (name === 'players') data = [{ id: id ?? PLAYER, name: player.name, username: 'benchmark', image_path: null, updated_at: created }];
      else if (name === 'player_preferences') data = [{ player_id: id, locale: 'en', skin_id: 'classic', icon_id: 'orb', ability_id: null, custom_shortcuts: false, keybindings: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', ability: 'Digit1' } }];
      else if (name === 'player_wallets') data = [{ player_id: id, balance: 1200 }];
      else if (['content_catalog', 'admin_content_catalog'].includes(name)) data = catalog;
      else if (name === 'cosmetic_state') data = { balance: 1200, purchases: [] };
      else if (['sync_achievements', 'achievement_state'].includes(name)) data = { attendance: { streak: 1, bestStreak: 1, lastDay: '2026-10-17', today: '2026-10-17', checkedInToday: true, nextCheckInAt: '2026-10-17T15:00:00Z' }, wins: 9, highestTile: 512, highestRank: 4, bestSoloTimeMs: null, highestSoloTile: 0, unlocks: [] };
      else if (name === 'rank_seasons' || name === 'admin_rank_seasons') data = [{ id: SEASON, name: 'Benchmark season', starts_at: created, ends_at: null, created_by: PLAYER, transition_reason: 'Benchmark' }];
      else if (['player_ratings', 'season_ratings'].includes(name)) data = [rating];
      else if (name === 'matches') data = [{ id: MATCH, started_at: match.startedAt, ended_at: match.endedAt, reason: match.reason, ranked: true, mode: match.mode, rank_seasons: rating.rank_seasons, match_participants: match.participants.map(p => ({ slot: p.slot, player_id: p.playerId, display_name: p.name, score: p.score, max_tile: p.maxTile, result: p.result, rating_before: 1400, rating_after: 1400, rating_delta: 0, tier_after: 'Platinum', placement_games: 10 })) }];
      else if (name === 'is_game_admin') data = true;
      else if (name === 'admin_overview') data = { periodDays: 30, periodStart: created, periodEnd: match.endedAt, totals: { matches: 1, rankedMatches: 1, players: 2, avgDurationSeconds: 60, avgScore: 256, telemetryParticipants: 0, unmeasuredParticipants: 2, avgMoves: null }, daily: [{ date: '2026-10-01', matches: 1 }], tiers: [], modes: [], reasons: [], attacks: [] };
      else if (name === 'admin_matches') data = { matches: [match], hasMore: false, nextCursor: null };
      else if (name === 'admin_match') data = match;
      else if (name === 'admin_players_filtered') data = { total: 1, players: [player] };
      else if (name === 'admin_player') data = { player, matches: [], audit: [] };
      else if (name === 'admin_audit_entries') data = { entries: [{ id: MATCH, createdAt: created, actorId: PLAYER, playerId: RIVAL, actorExists: true, playerExists: true, action: 'suspend', reason: 'Benchmark audit note' }], hasMore: false, nextCursor: null };
      else if (name === 'feedback') { data = [{ id: MATCH, created_at: created, player_id: PLAYER, category: 'bug', subject: 'Benchmark feedback', message: 'Benchmark report', page_path: '/', locale: 'en', display_name: player.name, email: player.email }]; response.setHeader('content-range', '0-0/1'); }
      else if (name === 'sync_daily_quests') data = { playerId: id, day: '2026-10-17', nextResetAt: '2026-10-17T15:00:00Z', balance: 1200, awarded: 0, quests: ['check-in', 'play-3', 'win-1'].map(id => ({ id, progress: id === 'check-in' ? 1 : 0, rewardedAt: id === 'check-in' ? created : null })) };
      else if (['my_season_rank', 'my_solo_rank'].includes(name)) data = 1;
      else if (name === 'social_messages') data = [];
      else if (name === 'social_players') data = [{ id: RIVAL, name: 'Benchmark Rival', icon_id: 'orb', relationship: 'friend', unread: 0 }];
      else if (['solo_leaderboard', 'solo_records', 'daily_quests', 'daily_quest_state'].includes(name)) data = [];
      else { unknown.push(url.pathname); response.writeHead(501, { 'content-type': 'application/json' }); response.end(JSON.stringify({ message: `Benchmark fixture missing ${name}` })); return; }
      if (Array.isArray(data) && request.headers.accept?.includes('vnd.pgrst.object')) data = data[0] ?? null;
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(data));
    } catch (error) { response.writeHead(500, { 'content-type': 'application/json' }); response.end(JSON.stringify({ message: String(error) })); }
  });
  api.listen(apiPort, '127.0.0.1'); await once(api, 'listening');
  process.env.CORS_ORIGINS = `http://127.0.0.1:${webPort},http://127.0.0.1:${adminPort}`;
  const game = createGameServer({ resolveAccount: async token => { assert.ok(token.endsWith('.fixture')); const { sub } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); assert.ok([PLAYER, RIVAL].includes(sub)); return { id: sub, name: sub === PLAYER ? 'Benchmark Player' : 'Benchmark Rival', skinId: 'classic', iconId: 'orb' }; }, readSuspensions: async () => [], readFriends: async () => [PLAYER, RIVAL], canSpectate: async () => true, readRating: async () => 1400, writeMatch: async record => { matches.push(record); }, writeSolo: async () => {} });
  game.httpServer.listen(socketPort, '127.0.0.1'); await once(game.httpServer, 'listening');
  return { requests, unknown, matches, game, applyMove: load('packages/game-core/src/index.ts').applyMove, close: async () => { await game.close(); api.closeAllConnections(); await new Promise(resolveClose => api.close(resolveClose)); } };
}

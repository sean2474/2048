import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServerFixture, fixturePlayer, fixtureSeason } from '../../web/tests/server-fixture.mjs';

// Exercise actual RSC HTML and access checks against a loopback API, without browser hydration.
test('admin records render on the server, share verified access, validate URL filters and stream skeletons', { timeout: 120000 }, async t => {
  let allowed = true, unavailable = false, release;
  const calls = [];
  const player = { id: fixturePlayer, name: '<script>Private player</script>', username: null, email: 'private@example.invalid', rating: 1200, tier: null, gamesPlayed: 0, wins: 0, losses: 0, draws: 0, createdAt: '2026-01-01T00:00:00Z', isAdmin: false, suspendedAt: null, suspensionReason: null };
  const app = await startServerFixture({ app: 'admin', handle: async (url, request) => {
    const name = url.pathname.split('/').at(-1);
    if (!url.pathname.includes('/rpc/')) return undefined;
    let body = ''; for await (const part of request) body += part;
    calls.push({ name, args: body ? JSON.parse(body) : {} });
    if (name === 'is_game_admin') return { data: allowed };
    if (name === 'admin_players_filtered') {
      if (release === 'hold') await new Promise(resolve => { release = resolve; });
      return unavailable ? { status: 503, data: { message: 'fixture unavailable' } } : { data: { total: 1, players: [player] } };
    }
    if (name === 'admin_player') return { data: { player, matches: [], audit: [] } };
    if (name === 'admin_rank_seasons') return { data: [{ ...fixtureSeason, created_by: fixturePlayer, transition_reason: 'SSR season history' }] };
    if (name === 'admin_matches') return { data: { matches: [], hasMore: false, nextCursor: null } };
    if (name === 'admin_audit_entries') return { data: { entries: [], hasMore: false, nextCursor: null } };
    if (name === 'admin_content_catalog') return { data: { skins: [], profileIcons: [], achievements: [] } };
    return { data: null };
  } });
  t.after(() => app.close());
  const cookie = app.cookie();
  const headers = { cookie: `${cookie.name}=${cookie.value}; 2048-locale=en`, 'accept-language': 'en-US' };
  const html = async path => (await fetch(app.origin + path, { headers })).text();
  const start = calls.length;
  const players = await html('/players?q=hello&status=invalid&offset=-1');
  assert.match(players, /&lt;script&gt;Private player&lt;\/script&gt;/);
  assert.doesNotMatch(players, /<script>Private player/);
  assert.match(players, /private@example.invalid/);
  assert.deepEqual(calls.find(call => call.name === 'admin_players_filtered').args, { p_query: 'hello', p_status: 'all', p_offset: 0 });
  assert.equal(calls.slice(start).filter(call => call.name === 'is_game_admin').length, 1);
  const detail = await html(`/players/${fixturePlayer}?returnTo=https://example.invalid`);
  assert.match(detail, /href="\/players"/);
  assert.match(detail, /Latest 20 matches/);
  assert.match(await html('/seasons'), /SSR season history/);
  assert.match(await html('/matches'), /No saved matches found/);
  assert.match(await html('/audit'), /No access changes recorded/);
  unavailable = true;
  assert.match(await html('/players'), /Players could not be loaded/);
  unavailable = false;
  assert.match(await html('/players'), /private@example.invalid/);
  allowed = false;
  const beforeDenied = calls.length;
  const denied = await html('/players');
  assert.match(denied, /Administrator access required/);
  assert.doesNotMatch(denied, /private@example.invalid/);
  assert.equal(calls.slice(beforeDenied).filter(call => call.name === 'admin_players_filtered').length, 0);
  allowed = true; release = 'hold';
  const response = await fetch(app.origin + '/players', { headers });
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let prefix = '';
  while (!prefix.includes('animate-pulse')) {
    const part = await reader.read();
    assert.equal(part.done, false, 'stream should yield loading markup before the RPC completes');
    prefix += decoder.decode(part.value);
  }
  assert.match(prefix, /motion-reduce:animate-none/);
  while (typeof release !== 'function') await new Promise(resolve => setTimeout(resolve, 10));
  release();
  let rest = '';
  for (;;) { const part = await reader.read(); if (part.done) break; rest += decoder.decode(part.value); }
  assert.match(prefix + rest, /private@example.invalid/);
});

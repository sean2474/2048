import assert from "node:assert/strict";
import test from "node:test";
import { startServerFixture, fixturePlayer, fixtureOldSeason, fixtureRating } from "./server-fixture.mjs";

test("server pages: streamed records, isolated accounts, seasons, recovery and static assets", { timeout: 180000 }, async t => {
  let fail = false, empty = false, hold, requested;
  const fixture = await startServerFixture({ handle: async (url) => {
    if (url.pathname.endsWith("/player_ratings")) {
      requested?.();
      if (hold) await hold;
      if (fail) return { status: 503, data: { message: "Fixture unavailable" } };
      if (empty) return { data: [] };
    }
    if (url.pathname.endsWith("/season_ratings")) return { data: [{ ...fixtureRating, display_name: "Archived Champion", season_id: fixtureOldSeason.id, tier: "Master", rating: 1900 }] };
  } });
  t.after(fixture.close);
  const read = async (path, id) => {
    const cookie = fixture.cookie(id);
    const response = await fetch(fixture.origin + path, { headers: { "accept-language": "en", ...(id ? { cookie: `${cookie.name}=${cookie.value}` } : {}) } });
    assert.equal(response.status, 200);
    return response.text();
  };
  const visibleHTML = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  for (const path of ["/privacy", "/terms", "/signup"]) {
    const html = visibleHTML(await read(path));
    assert.match(html, /href="\/(privacy|terms)"/);
    if (path !== "/signup") assert.match(html, /mailto:sean24740@gmail.com/);
  }
  const guest = visibleHTML(await read("/"));
  assert.match(guest, /id="profile-title"[^>]*>Guest</);
  assert.doesNotMatch(guest, /Checking your account/);
  assert.equal(fixture.requests.filter(row => row.path.endsWith("/player_ratings")).length, 0);

  fixture.requests.length = 0;
  const profile = visibleHTML(await read("/", fixturePlayer));
  assert.match(profile, /id="profile-title"[^>]*>Fixture Challenger</);
  assert.match(profile, /1,400/);
  assert.match(profile, /Opponent/);
  assert.equal(fixture.requests.filter(row => row.path.endsWith("/players")).length, 1, "layout/header/page share one profile request");
  assert.equal(fixture.requests.filter(row => row.path === "/auth/v1/user").length, 2, "one middleware check and one shared RSC check");
  assert.equal(fixture.requests.filter(row => row.path.endsWith("/player_ratings")).length, 1);
  const ownQuery = fixture.requests.find(row => row.path.endsWith("/matches"));
  assert.equal(new URLSearchParams(ownQuery.search).get("own.player_id"), `eq.${fixturePlayer}`);

  const other = "20000000-0000-4000-8000-000000000099";
  const [first, second] = await Promise.all([read("/", fixturePlayer), read("/", other)]);
  assert.match(visibleHTML(first), /id="profile-title"[^>]*>Fixture Challenger</);
  assert.match(visibleHTML(second), /id="profile-title"[^>]*>Second Player</);
  assert.match(visibleHTML(await read("/history")), /Login required/);
  assert.match(visibleHTML(await read("/history", fixturePlayer)), /Opponent/);

  assert.match(visibleHTML(await read("/leaderboard")), /Fixture Challenger/);
  assert.match(visibleHTML(await read(`/leaderboard?season=${fixtureOldSeason.id}`)), /Archived Champion/);
  assert.match(visibleHTML(await read("/leaderboard?season=invalid")), /Unable to load records/);
  empty = true; assert.match(visibleHTML(await read("/leaderboard")), /No ranked players yet/);
  empty = false; fail = true; assert.match(visibleHTML(await read("/leaderboard")), /Unable to load records/);
  fail = false; assert.match(visibleHTML(await read("/leaderboard")), /Fixture Challenger/);

  let release;
  hold = new Promise(resolve => { release = resolve; });
  const queryStarted = new Promise(resolve => { requested = resolve; });
  const cookie = fixture.cookie();
  const responsePromise = fetch(fixture.origin, { headers: { cookie: `${cookie.name}=${cookie.value}`, "accept-language": "en" } });
  await queryStarted;
  const response = await responsePromise, reader = response.body.getReader(), decoder = new TextDecoder();
  let streamed = "";
  try {
    while (!streamed.includes('aria-label="Loading ranked record…"')) {
      const { done, value } = await reader.read();
      assert.equal(done, false, "skeleton arrives before the delayed rating query finishes");
      streamed += decoder.decode(value);
    }
    assert.match(streamed, /motion-reduce:animate-none/);
  } finally { release(); hold = null; requested = null; }
  while (true) { const { done, value } = await reader.read(); if (done) break; streamed += decoder.decode(value); }
  assert.match(visibleHTML(streamed), /1,400/);

  fixture.requests.length = 0;
  const asset = await fetch(fixture.origin + "/profile-icons/fox.svg", { headers: { cookie: `${cookie.name}=${cookie.value}` } });
  assert.equal(asset.status, 200);
  assert.equal(fixture.requests.length, 0, "profile icon requests bypass authentication middleware");
});

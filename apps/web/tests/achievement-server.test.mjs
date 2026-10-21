import assert from "node:assert/strict";
import test from "node:test";
import { startServerFixture, fixturePlayer } from "./server-fixture.mjs";

const metadata = { status: "published", revision: 1, publishedOnce: true, updatedAt: "2026-10-22T00:00:00Z", sortOrder: 0 };
const icon = { ...metadata, id: "attendance-king", name: "Attendance king", description: "An attendance reward", acquisition: "achievement", price: 0, color: "#f0af12", imagePath: "profile-icons/attendance-king.svg" };
const catalog = { skins: [], profileIcons: [icon], achievements: [
  { ...metadata, id: "checkin-30", name: "Attendance king", description: "Visit 30 days", metric: "attendance_streak", target: 30, reward: { kind: "icon", iconId: icon.id } },
  { ...metadata, id: "wins-10", name: "Ten wins", description: "Win ten matches", metric: "wins", target: 10, reward: { kind: "icon", iconId: icon.id } },
  { ...metadata, id: "rank-platinum", name: "Platinum collector", description: "Reach Platinum", metric: "rank_tier", target: 4, reward: { kind: "icon", iconId: icon.id } },
] };
const data = { attendance: { streak: 8, bestStreak: 12, lastDay: "2026-10-21", today: "2026-10-22", checkedInToday: false, nextCheckInAt: "2026-10-22T15:00:00Z" }, wins: 10, highestTile: 512, unlocks: [{ achievementId: "wins-10", unlockedAt: "2026-10-21T00:00:00Z" }] };
const visible = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");

test("achievement RSC renders progress, URL filters, errors and streamed skeletons without browser mutations", { timeout: 180000 }, async t => {
  let fail = false, hold, queryStarted;
  const fixture = await startServerFixture({ handle: async (url, request, id) => {
    if (url.pathname.endsWith("/rpc/content_catalog")) return { data: catalog };
    if (url.pathname.endsWith("/rpc/achievement_state")) {
      queryStarted?.(); if (hold) await hold;
      return fail ? { status: 503, data: {} } : { data: { ...data, highestRank: id === fixturePlayer ? 4 : 0, wins: id === fixturePlayer ? 10 : 2, unlocks: id === fixturePlayer ? [...data.unlocks, { achievementId: "rank-platinum", unlockedAt: "2026-10-21T00:00:00Z" }] : [] } };
    }
  } });
  t.after(fixture.close);
  const read = async (path, id) => {
    const cookie = fixture.cookie(id);
    const response = await fetch(fixture.origin + path, { headers: { "accept-language": "en", ...(id ? { cookie: `${cookie.name}=${cookie.value}` } : {}) } });
    assert.equal(response.status, 200); return response.text();
  };
  const html = visible(await read("/achievements", fixturePlayer));
  assert.match(html, /8.*?<\/span>/);
  assert.match(html, /Permanently unlocked/);
  assert.match(html, /id="checkin-30"/);
  assert.match(html, /id="rank-platinum"[^]*?<progress[^>]*max="100"[^>]*value="100"/);
  assert.match(html, /href="\/achievements\?filter=completed"/);
  const completed = visible(await read("/achievements?filter=completed", fixturePlayer));
  assert.match(completed, /id="wins-10"/); assert.doesNotMatch(completed, /id="checkin-30"/);
  const progress = visible(await read("/achievements?filter=progress", fixturePlayer));
  assert.match(progress, /id="checkin-30"/); assert.doesNotMatch(progress, /id="wins-10"/);
  const guest = visible(await read("/achievements"));
  assert.match(guest, /Sign in to record attendance and achievements/);
  assert.doesNotMatch(guest, /Permanently unlocked/);
  const other = visible(await read("/achievements", "20000000-0000-4000-8000-000000000099"));
  assert.doesNotMatch(other, /Permanently unlocked/);
  fail = true;
  assert.match(visible(await read("/achievements", fixturePlayer)), /Could not load achievement progress/);
  fail = false;
  assert.match(visible(await read("/achievements", fixturePlayer)), /Permanently unlocked/);
  assert.equal(fixture.requests.filter(({ path }) => /\/(sync_achievements|check_in)$/.test(path)).length, 0, "server rendering never awards or writes attendance");

  let release;
  hold = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { queryStarted = resolve; });
  const cookie = fixture.cookie();
  const responsePromise = fetch(fixture.origin + "/achievements", { headers: { cookie: `${cookie.name}=${cookie.value}`, "accept-language": "en" } });
  await started;
  let streamed = "";
  try {
    const response = await responsePromise, reader = response.body.getReader(), decoder = new TextDecoder();
    while (!streamed.includes('aria-label="Loading achievements…"')) {
      const { done, value } = await reader.read();
      assert.equal(done, false, "skeleton must arrive while the actual achievement read is pending");
      streamed += decoder.decode(value);
    }
    assert.match(streamed, /motion-reduce:animate-none/);
    release(); hold = null; queryStarted = null;
    while (true) { const { done, value } = await reader.read(); if (done) break; streamed += decoder.decode(value); }
    assert.match(visible(streamed), /Permanently unlocked/);
  } finally { release(); hold = null; queryStarted = null; }
});

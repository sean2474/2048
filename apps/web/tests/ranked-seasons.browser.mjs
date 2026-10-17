import { startServerFixture } from "./server-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { mockAccount } from "./browser-fixtures.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const origin = "http://[::1]:3001", id = "10000000-0000-4000-8000-000000000099";
const current = { id: "11111111-1111-4111-8111-111111111111", name: "Season Two", starts_at: "2026-10-16T00:00:00Z", ends_at: null };
const old = { id: "22222222-2222-4222-8222-222222222222", name: "Season One", starts_at: "2026-10-01T00:00:00Z", ends_at: current.starts_at };
const artifacts = fileURLToPath(new URL("../../../docs/ranked-seasons/", import.meta.url));

test("lifetime evaluation, season qualification, peak rank and archived snapshots", { timeout: 120000 }, async t => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
  const row = { player_id: id, display_name: "Fixture Challenger", rating: 1399, wins: 8, losses: 1, draws: 0, games_played: 9, highest_score: 2048, highest_tile: 512, season_id: current.id, rank_seasons: { name: current.name }, tier: null, placement_games: 9, peak_rating: null };
  let fail = false, empty = false;
  const fixture = await startServerFixture({ handle: async (url, request) => {
    let value;
    if (url.pathname.endsWith("/rank_seasons")) value = [current, old];
    else if (url.pathname.endsWith("/player_ratings")) {
      assert.doesNotMatch(url.searchParams.get("select"), /promotion_/);
      if (fail) return { status: 503, data: { message: "Fixture unavailable" } };
      const standings = url.searchParams.has("games_played");
      if (standings) {
        assert.equal(url.searchParams.get("games_played"), "gte.10");
        assert.equal(url.searchParams.has("placement_games"), false);
      }
      value = empty || (standings && row.games_played < 10) ? [] : [{ ...row }];
      if (request.headers.accept?.includes("vnd.pgrst.object")) value = value[0] ?? null;
    } else if (url.pathname.endsWith("/season_ratings")) {
      assert.equal(url.searchParams.get("games_played"), "gte.10");
      value = [{ ...row, display_name: "Archived Champion", season_id: old.id, tier: "Master", rating: 1900, placement_games: 10, games_played: 20, peak_rating: 1930 }];
    } else if (url.pathname.endsWith("/matches")) {
      assert.doesNotMatch(url.searchParams.get("select"), /promotion_/);
      value = [{ id: "33333333-3333-4333-8333-333333333333", started_at: old.starts_at, ended_at: "2026-10-10T00:00:00Z", reason: "surrender", ranked: true, mode: "ranked", rank_seasons: { name: old.name }, match_participants: [{ slot: 1, player_id: id, display_name: row.display_name, score: 100, max_tile: 64, result: "win", rating_before: 1190, rating_after: 1210, rating_delta: 20, tier_after: "Silver", placement_games: 5 }, { slot: 2, player_id: "44444444-4444-4444-8444-444444444444", display_name: "Opponent", score: 20, max_tile: 16, result: "loss" }] }];
    } else return;
    return { data: value };
  } });
  t.after(fixture.close);
  const origin = fixture.origin;
  await context.addCookies([fixture.cookie(id), { name: "duo-locale", value: "en", url: origin }]);
  await page.goto(origin); await page.getByText("Evaluating: 9/10", { exact: true }).waitFor();
  const profile = page.locator('section[aria-labelledby="profile-title"]');
  assert.match(await profile.innerText(), /1,399/); assert.doesNotMatch(await profile.innerText(), /Gold|Platinum/);
  await page.getByText("Season participation: 9/10", { exact: true }).waitFor();
  await page.goto(`${origin}/leaderboard`); await page.getByText("No ranked players yet.", { exact: true }).waitFor();
  Object.assign(row, { wins: 9, games_played: 10, tier: "Platinum", placement_games: 10, rating: 1400, peak_rating: 1400 });
  await page.goto(origin); await page.getByText("Season standings unlocked", { exact: true }).waitFor();
  assert.equal(await profile.getByText("Evaluating", { exact: true }).count(), 0);
  await page.getByText("200 Elo to Diamond", { exact: true }).waitFor();
  Object.assign(row, { wins: 0, losses: 0, games_played: 0, peak_rating: null });
  await page.reload(); await page.getByText("Season participation: 0/10", { exact: true }).waitFor();
  await profile.getByText("Platinum", { exact: true }).waitFor(); assert.match(await profile.innerText(), /1,400/);
  assert.equal(await profile.getByText("Evaluating", { exact: true }).count(), 0);
  await page.getByText("No official result this season", { exact: true }).waitFor();
  await mkdir(artifacts, { recursive: true });
  for (const [width, height] of [[375, 812], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `dashboard overflow at ${width}`);
    await page.screenshot({ path: `${artifacts}/elo-carryover-${width}.png`, fullPage: true });
  }
  Object.assign(row, { wins: 4, losses: 5, games_played: 9, rating: 1390, tier: "Gold", peak_rating: 1605 });
  await page.reload(); await page.getByText("Season participation: 9/10", { exact: true }).waitFor();
  await profile.getByText("Gold", { exact: true }).waitFor(); await profile.getByText("Diamond", { exact: true }).waitFor();
  await page.getByText("1,605 ELO", { exact: true }).waitFor(); await page.getByText("10 Elo to Platinum", { exact: true }).waitFor();
  await page.goto(`${origin}/leaderboard`); await page.getByText("No ranked players yet.", { exact: true }).waitFor();
  Object.assign(row, { draws: 1, games_played: 10 });
  await page.reload(); await page.getByRole("rowheader", { name: /Fixture Challenger/ }).waitFor();
  assert.match(await page.locator("tbody").innerText(), /Gold/); assert.doesNotMatch(await page.locator("tbody").innerText(), /Platinum/);
  const season = page.getByRole("combobox", { name: "Season", exact: true }); await season.focus(); assert.equal(await season.evaluate(el => el === document.activeElement), true); await season.selectOption(old.id);
  await page.getByRole("rowheader", { name: /Archived Champion/ }).waitFor(); assert.match(await page.locator("tbody").innerText(), /Master/); await page.getByText("Archived season", { exact: true }).waitFor();
  await season.selectOption("current"); await page.getByRole("rowheader", { name: /Fixture Challenger/ }).waitFor();
  await season.blur();
  for (const [width, height] of [[375, 812], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.locator("table").scrollIntoViewIfNeeded();
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo({ top: 0, behavior: "instant" });
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `leaderboard overflow at ${width}`);
    assert.equal(await page.getByRole("heading", { name: "Ranked leaderboard", exact: true }).count(), 1);
    assert.equal(await page.locator("tbody tr").count(), 1);
    await page.screenshot({ path: `${artifacts}/leaderboard-${width}.png`, fullPage: true, animations: "disabled" });
    if (width === 375) await page.locator("table").screenshot({ path: `${artifacts}/leaderboard-table-375.png`, animations: "disabled" });
  }
  empty = true; await page.reload(); await page.getByText("No ranked players yet.", { exact: true }).waitFor();
  fail = true; await page.reload(); await page.getByRole("alert").filter({ hasText: "Unable to load records" }).waitFor();
  fail = false; empty = false; await page.getByRole("button", { name: "Try again", exact: true }).click(); await page.getByRole("rowheader", { name: /Fixture Challenger/ }).waitFor();
  await page.goto(`${origin}/history`); await page.getByText("Silver", { exact: true }).waitFor(); assert.match(await page.locator("main").innerText(), /Season One/); assert.doesNotMatch(await page.locator("main").innerText(), /Gold/);
  await page.goto(`${origin}/how-to-play`); await page.getByText(/tiers change automatically with Elo/).waitFor();
  assert.doesNotMatch(await page.locator("main").innerText(), /promotion games|5 placements/);
  assert.deepEqual(errors, []);
});

test("ranked intro refreshes earned tiers and results show the saved match snapshot", { timeout: 120000 }, async t => {
  const { createGameServer } = require("../../socket/src/server.ts");
  const secondId = "20000000-0000-4000-8000-000000000099";
  const established = { tier: "Gold", placement_games: 10 };
  const placement = { tier: null, placement_games: 0 };
  let finishSave, savedMatch, writes = 0, ratingDelta = 16, failRating = false;
  const server = createGameServer({
    resolveAccount: async token => { const userId = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub; assert.ok([id, secondId].includes(userId)); return { id: userId, name: userId === id ? "Established Player" : "Placement Player", iconId: "dragon", rating: 1200, rank: placement }; },
    readRating: async userId => ({ rating: 1390, rank: userId === id ? established : placement }),
    readSuspensions: async () => [],
    writeMatch: record => { writes++; savedMatch = record; return new Promise(resolve => { finishSave = resolve; }); },
  });
  server.io.engine.opts.allowUpgrades = false;
  await new Promise(resolve => server.httpServer.listen(0, "127.0.0.1", resolve));
  const socketOrigin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const contexts = [];
  t.after(async () => { finishSave?.(); for (const context of contexts) await context.unrouteAll({ behavior: "ignoreErrors" }); await browser.close(); await server.close(); });
  const pages = [], errors = [];
  for (const [userId, width] of [[id, 1440], [secondId, 375]]) {
    const context = await browser.newContext({ locale: "en-US", viewport: { width, height: 900 } });
    contexts.push(context);
    await context.addCookies([{ name: "duo-locale", value: "en", url: origin }]);
    await context.route("**/socket.io/**", async route => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: `${socketOrigin}${url.pathname}${url.search}` });
      await route.fulfill({ response, headers: { ...response.headers(), "access-control-allow-origin": "*" } });
    });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    const account = await mockAccount(page, userId); account.row.locale = "en";
    await page.route("**/rest/v1/match_participants?**", route => {
      const url = new URL(route.request().url());
      assert.doesNotMatch(url.searchParams.get("select"), /promotion_/);
      const requested = url.searchParams.get("match_id");
      assert.equal(requested, `eq.${savedMatch.id}`);
      if (failRating) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Fixture unavailable" }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ rating_before: 1390, rating_after: userId === id ? 1406 : 1374, rating_delta: userId === id ? ratingDelta : -16, tier_after: userId === id ? "Platinum" : null, placement_games: userId === id ? 10 : 1 }]) });
    });
    pages.push(page); await page.goto(`${origin}/play/ranked`);
  }
  const [a, b] = pages;
  for (const page of pages) await page.getByRole("dialog", { name: "Match found", exact: true }).waitFor();
  assert.match(await a.locator(".match-intro-you .match-intro-rank").innerText(), /Gold/);
  assert.doesNotMatch(await a.locator(".match-intro-you .match-intro-rank").innerText(), /Platinum/);
  assert.match(await b.locator(".match-intro-you .match-intro-rank").innerText(), /Evaluating/);
  for (const page of pages) await page.getByRole("button", { name: "Surrender", exact: true }).waitFor();
  await b.getByRole("button", { name: "Surrender", exact: true }).click(); await b.getByRole("alertdialog").getByRole("button", { name: "Surrender", exact: true }).click();
  const result = a.getByRole("dialog", { name: "You win!", exact: true }); await result.waitFor();
  await result.getByText("Your rank updates after the result is saved.", { exact: true }).waitFor();
  assert.equal(writes, 1); finishSave();
  await result.getByText("Platinum", { exact: true }).waitFor();
  await b.getByRole("dialog").getByText("Evaluating: 1/10", { exact: true }).waitFor();
  assert.match(await result.innerText(), /1390 → 1406 ELO/);
  await result.getByText("Rating change: +16 ELO", { exact: true }).waitFor();
  await b.getByRole("dialog").getByText("Rating change: −16 ELO", { exact: true }).waitFor();
  for (const page of pages) assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await a.screenshot({ path: `${artifacts}/elo-result.png`, animations: "disabled" });
  ratingDelta = 0;
  await a.evaluate(() => window.dispatchEvent(new Event("online")));
  await result.getByText("Rating change: 0 ELO", { exact: true }).waitFor();
  failRating = true;
  await a.evaluate(() => window.dispatchEvent(new Event("online")));
  await result.getByRole("button", { name: "Retry rating", exact: true }).waitFor();
  failRating = false; ratingDelta = null;
  await result.getByRole("button", { name: "Retry rating", exact: true }).click();
  await result.getByText("1390 → 1406 ELO", { exact: true }).waitFor();
  assert.equal(await result.getByText(/Rating change:/).count(), 0, "missing authoritative delta is not inferred from before/after");
  assert.deepEqual(errors, []);
});

test("unavailable ranked storage never promises a later rank update", { timeout: 60000 }, async t => {
  const { createGameServer } = require("../../socket/src/server.ts");
  const server = createGameServer({ resolveAccount: async () => ({ id, name: "Fixture Player" }) });
  server.io.engine.opts.allowUpgrades = false;
  await new Promise(resolve => server.httpServer.listen(0, "127.0.0.1", resolve));
  const socketOrigin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 375, height: 812 } });
  t.after(async () => { await context.unrouteAll({ behavior: "ignoreErrors" }); await browser.close(); await server.close(); });
  await context.addCookies([{ name: "duo-locale", value: "en", url: origin }]);
  await context.route("**/socket.io/**", async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${socketOrigin}${url.pathname}${url.search}` });
    await route.fulfill({ response, headers: { ...response.headers(), "access-control-allow-origin": "*" } });
  });
  const player = { skinId: "classic", board: [{ id: 1, row: 0, col: 0, value: 2 }], score: 0, maxTile: 2, attacksSent: { xblock: 0, hardblock: 0 }, ability: { id: "clear-x", charge: 0, spawnPauseMoves: 0, anchorMoves: 0, slowStartsAt: 0, slowEndsAt: 0, nextMoveAt: 0 } };
  server.io.on("connection", socket => {
    socket.removeAllListeners("message");
    socket.on("message", message => { if (message.t === "joinRoom") socket.emit("message", { t: "end", matchId: "unavailable-fixture", mode: "ranked", recording: "unavailable", winner: "you", reason: "surrender", you: player, opp: player }); });
  });
  const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
  const account = await mockAccount(page, id); account.row.locale = "en";
  let ratingRequests = 0;
  page.on("request", request => { if (request.url().includes("/match_participants?")) ratingRequests++; });
  await page.goto(`${origin}/play/33333333-3333-4333-8333-333333333333`);
  const result = page.getByRole("dialog", { name: "You win!", exact: true });
  await result.getByText("Rank cannot update because match storage is unavailable.", { exact: true }).waitFor();
  assert.equal(await result.getByText("Your rank updates after the result is saved.", { exact: true }).count(), 0);
  assert.equal(await result.getByText(/Rating change:/).count(), 0);
  assert.equal(ratingRequests, 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
});

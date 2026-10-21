import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { mockAccount } from "./browser-fixtures.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { createGameServer } = require("../../socket/src/server.ts");
const { matchmakingQueue } = require("../../socket/src/state.ts");
const origin = "http://[::1]:3001";
const artifacts = fileURLToPath(new URL("../../../docs/match-presentation/", import.meta.url));

// All sockets use an isolated server with no production database writer.
async function withServer(run, options = {}) {
  const server = createGameServer(options);
  server.io.engine.opts.allowUpgrades = false;
  await new Promise(resolve => server.httpServer.listen(0, "127.0.0.1", resolve));
  const socketOrigin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ locale: "ko-KR", viewport: { width: 1440, height: 900 } });
  const network = { offline: false }, errors = [];
  context.on("page", page => { page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message)); });
  fs.mkdirSync(artifacts, { recursive: true });
  try {
    await context.route("**/socket.io/**", async route => {
      if (network.offline) return route.abort();
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: `${socketOrigin}${url.pathname}${url.search}` });
      await route.fulfill({ response, headers: { ...response.headers(), "access-control-allow-origin": "*" } });
    });
    await run({ server, context, network });
    assert.deepEqual(errors, []);
  } finally { await context.unrouteAll({ behavior: "ignoreErrors" }); await browser.close(); await server.close(); }
}

test("waiting, retry, cancel, ranked guest gate and real victory/defeat overlays", { timeout: 120000 }, async () => {
  await withServer(async ({ context, network }) => {
    const a = await context.newPage();
    network.offline = true;
    await a.goto(`${origin}/play/online`);
    await a.getByRole("main").getByRole("alert").waitFor();
    assert.equal(await a.locator(".lobby-queue").getAttribute("data-searching"), "false");
    await a.screenshot({ path: `${artifacts}/connection-error.png`, fullPage: true });
    network.offline = false;
    await a.getByRole("button", { name: "다시 시도", exact: true }).click();
    await a.getByRole("status").filter({ hasText: "상대 찾는 중" }).waitFor();
    assert.equal(await a.getByRole("main").getByRole("link").count(), 1);
    for (const [width, height] of [[1440, 900], [375, 812], [320, 740]]) {
      await a.setViewportSize({ width, height });
      assert.equal(await a.evaluate(() => document.documentElement.scrollWidth), width);
      await a.screenshot({ path: `${artifacts}/waiting-${width}x${height}.png`, fullPage: true });
    }
    await a.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await a.locator(".lobby-radar-ring").evaluate(el => getComputedStyle(el).animationName), "none");
    const cancel = a.getByRole("link", { name: "매칭 취소", exact: true });
    await a.keyboard.press("Tab");
    await cancel.focus();
    assert.notEqual(await cancel.evaluate(el => getComputedStyle(el).outlineStyle), "none");
    assert.ok((await cancel.boundingBox()).height >= 44);
    await a.keyboard.press("Enter");
    await a.waitForURL("**/find-match");
    for (let attempt = 0; attempt < 40 && matchmakingQueue.length; attempt++) await delay(50);
    assert.equal(matchmakingQueue.length, 0);
    await a.goto(`${origin}/play/ranked`);
    await a.getByRole("link", { name: "로그인하고 랭크전 시작", exact: true }).waitFor();
    assert.equal(await a.locator(".lobby-queue").count(), 0);
    assert.equal(matchmakingQueue.length, 0);
    await a.screenshot({ path: `${artifacts}/ranked-login.png`, fullPage: true });
    await a.setViewportSize({ width: 1440, height: 900 });
    await a.emulateMedia({ reducedMotion: "no-preference" });
    await a.goto(`${origin}/play/online`);
    await a.getByRole("status").filter({ hasText: "상대 찾는 중" }).waitFor();
    const b = await context.newPage();
    await b.setViewportSize({ width: 375, height: 812 });
    await b.goto(`${origin}/play/online`);
    for (const page of [a, b]) await page.getByRole("dialog", { name: "대전 상대 발견" }).waitFor();
    await a.screenshot({ path: `${artifacts}/match-found-1440x900.png`, animations: "disabled" });
    for (const page of [a, b]) {
      await page.waitForURL(/\/play\/[a-f\d-]{36}$/);
      await page.getByRole("button", { name: "기권", exact: true }).waitFor();
    }
    for (const key of ["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"]) await a.keyboard.press(key);
    await b.getByRole("button", { name: "기권", exact: true }).click();
    await b.getByRole("alertdialog").getByRole("button", { name: "기권", exact: true }).click();
    for (const [page, outcome, title] of [[a, "victory", "승리!"], [b, "defeat", "패배"]]) {
      const result = page.getByRole("dialog", { name: title, exact: true });
      await result.waitFor();
      assert.equal(await result.getAttribute("data-outcome"), outcome);
      assert.deepEqual(await result.boundingBox(), { x: 0, y: 0, ...page.viewportSize() });
      assert.equal(await page.evaluate(() => sessionStorage.getItem("duo.currentRoom")), null);
      await page.screenshot({ path: `${artifacts}/${outcome}-${page.viewportSize().width}.png`, animations: "disabled" });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), page.viewportSize().width);
      assert.equal(await result.getByRole("link", { name: "다시 대전", exact: true }).getAttribute("href"), "/play/online");
    }
    await a.getByRole("button", { name: "마지막 보드 보기", exact: true }).click();
    await a.getByRole("dialog").waitFor({ state: "hidden" });
    await a.waitForFunction(() => document.activeElement === document.querySelector(".match-result h2"));
    await b.keyboard.press("Escape");
    await b.getByRole("dialog").waitFor({ state: "hidden" });
    await b.getByRole("link", { name: "다시 대전", exact: true }).click();
    await b.waitForURL("**/play/online");
    await b.getByRole("status").filter({ hasText: "상대 찾는 중" }).waitFor();
  });
});

test("selected account icon appears while waiting", async () => {
  await withServer(async ({ context }) => {
    const page = await context.newPage();
    const account = await mockAccount(page);
    account.row.icon_id = "dragon";
    await page.goto(`${origin}/play/online`);
    await page.locator(".lobby-portrait [data-profile-icon=dragon]").waitFor();
    assert.equal(await page.locator(".lobby-player .lobby-name").first().textContent(), "타일탐험가");
    await page.getByRole("status").filter({ hasText: "상대 찾는 중" }).waitFor();
    await page.screenshot({ path: `${artifacts}/account-waiting.png`, animations: "disabled" });
  }, { resolveAccount: async () => ({ id: "10000000-0000-4000-8000-000000000099", name: "타일탐험가", iconId: "dragon", rating: 1460 }), readSuspensions: async () => [] });
});

test("result variants, missing opponent, reduced motion and recording updates", { timeout: 120000 }, async () => {
  await withServer(async ({ context, server }) => {
    let socket;
    const player = { ability: { id: "clear-x", charge: 0, spawnPauseMoves: 0, anchorMoves: 0, slowStartsAt: 0, slowEndsAt: 0, nextMoveAt: 0 }, skinId: "classic", board: [{ id: 1, row: 0, col: 0, value: 2048 }], score: 20504, maxTile: 2048, attacksSent: { xblock: 0, hardblock: 0 } };
    server.io.on("connection", connection => {
      socket = connection;
      connection.removeAllListeners("message");
      connection.on("message", message => { if (message.t === "joinRoom") connection.emit("message", { t: "state", serverTime: Date.now(), mode: "ranked", you: player, opp: player, names: { you: "아주긴닉네임도화면밖으로나가지않아요", opp: "상대플레이어" }, paused: false, pendingAttacks: 0, incomingAttacks: { xblock: 0, hardblock: 0 } }); });
    });
    for (const [winner, reason, title, mode] of [["you", "reached_1024", "승리!", "ranked"], ["opp", "reached_1024", "패배", "casual"], ["draw", "draw", "무승부", "friend"], ["opp", "opponent_locked", "패배", "casual"], ["you", "opponent_disconnected", "승리!", "friend"]]) {
      const page = await context.newPage();
      await page.setViewportSize({ width: 375, height: 812 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`${origin}/play/20000000-0000-4000-8000-000000000001`);
      await page.locator(".game-you").waitFor();
      assert.equal(await page.locator(".match-toolbar [data-emblem=crown]").count(), 1);
      const end = { t: "end", matchId: "fixture-match", mode, winner, reason, recording: "saving", you: player, ...(winner === "opp" ? {} : { opp: { ...player, score: 18064 } }) };
      socket.emit("message", end);
      const result = page.getByRole("dialog", { name: title, exact: true });
      await result.waitFor();
      if (reason === "reached_1024") {
        assert.equal(await result.locator(".match-end-description").textContent(), `${winner === "opp" ? "상대가 " : ""}1024를 먼저 만들었습니다.`);
      }
      assert.equal(await result.locator(".match-end-title").evaluate(el => getComputedStyle(el).animationName), "none");
      assert.equal(await result.locator(".match-end-score").first().textContent(), "20,504");
      if (winner === "opp") assert.equal(await result.locator(".match-end-score").last().textContent(), "—");
      assert.equal(await result.getByRole("link", { name: "다시 대전", exact: true }).getAttribute("href"), mode === "friend" ? "/play/create" : mode === "ranked" ? "/play/ranked" : "/play/online");
      socket.emit("message", { t: "recordStatus", matchId: end.matchId, status: "saved" });
      await result.getByRole("status").filter({ hasText: "경기 결과가 기록에 저장되었습니다" }).waitFor();
      await page.screenshot({ path: `${artifacts}/result-${reason}.png`, animations: "disabled" });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
      await page.keyboard.press("Escape");
      await result.waitFor({ state: "hidden" });
      socket.emit("message", { t: "recordStatus", matchId: end.matchId, status: "delayed" });
      socket.emit("message", end);
      await page.locator(".match-result [role=status]").filter({ hasText: "결과 저장을 확인하지 못했습니다" }).waitFor();
      assert.equal(await result.isVisible(), false);
      await page.close();
    }
  });
});

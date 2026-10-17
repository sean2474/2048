import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");
const artifacts = fileURLToPath(new URL("../../../docs/profile-icons", import.meta.url));
const origin = process.env.WEB_TEST_ORIGIN ?? "http://[::1]:3001";
const roomId = "20000000-0000-4000-8000-000000000001";

import { mockAccount, mockCatalog } from "./browser-fixtures.mjs";

// Local Socket.IO polling fixture: exercises the real lobby hook without creating accounts or matches.
async function mockMatch(page, { mode = "casual", rating = 1460, opponentName = "달빛수호자", iconId = "dragon", duplicate = false, fail = false } = {}) {
  const sent = [];
  const sessions = new Map();
  let sequence = 0;
  const cors = { "access-control-allow-origin": "*", "content-type": "text/plain;charset=UTF-8" };
  await page.route("**/socket.io/**", async route => {
    const request = route.request(), url = new URL(request.url()), sid = url.searchParams.get("sid");
    const respond = body => route.fulfill({ status: 200, headers: cors, body });
    if (!sid) {
      const id = `fixture-${++sequence}`;
      sessions.set(id, { queue: [], waiting: null, iconId: "fox" });
      return respond(`0${JSON.stringify({ sid: id, upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1000000 })}`);
    }
    const session = sessions.get(sid);
    const push = message => {
      if (session.waiting) { const reply = session.waiting; session.waiting = null; void reply(message); }
      else session.queue.push(message);
    };
    if (request.method() === "GET") {
      if (session.queue.length) return respond(session.queue.splice(0).join("\x1e"));
      session.waiting = respond;
      return;
    }
    for (const data of (request.postData() ?? "").split("\x1e")) {
      if (data.startsWith("40")) {
        session.iconId = JSON.parse(data.slice(2)).iconId;
        push('40{"sid":"fixture-socket"}');
      } else if (data.startsWith("42")) {
        const [, message] = JSON.parse(data.slice(2));
        sent.push(message);
        if (["findMatch", "createRoomWithCode", "joinRoomWithCode"].includes(message.t)) {
          const match = { t: message.t === "findMatch" ? "matchFound" : "roomReady", roomId, mode,
            players: { you: { name: iconId === "guest" ? "Guest" : "타일탐험가", iconId, rating, ...(rating === null ? {} : { rank: { tier: "Platinum", placement_games: 10 } }) }, opp: { name: iconId === "guest" ? "Guest" : opponentName, iconId: iconId === "guest" ? "guest" : "owl", rating: rating === null ? null : 1688, ...(rating === null ? {} : { rank: { tier: "Diamond", placement_games: 10 } }) } } };
          const packet = `42${JSON.stringify(["message", fail ? { t: "error", reason: "code_not_found" } : match])}`;
          push(duplicate ? `${packet}\x1e${packet}` : packet);
        } else if (message.t === "joinRoom") {
          const player = { board: [{ id: 1, row: 0, col: 0, value: 2 }, { id: 2, row: 0, col: 1, value: 2 }], score: 0, maxTile: 2, attacksSent: { xblock: 0, hardblock: 0 }, skinId: "classic", ability: { id: "clear-x", charge: 0, spawnPauseMoves: 0, anchorMoves: 0, slowStartsAt: 0, slowEndsAt: 0, nextMoveAt: 0 } };
          push(`42${JSON.stringify(["message", { t: "state", mode, serverTime: Date.now(), you: player, opp: player, names: { you: "타일탐험가", opp: opponentName }, paused: false, pendingAttacks: 0, incomingAttacks: { xblock: 0, hardblock: 0 } }])}`);
        }
      }
    }
    return respond("ok");
  });
  return sent;
}

test("account catalog icons persist and preserve settings on failed saves", async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({ locale: "ko-KR", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(), errors = [];
    await mockCatalog(page);
    page.setDefaultTimeout(10000);
    page.on("pageerror", error => errors.push(error.message));
    const account = await mockAccount(page);
    account.cosmetics.purchases = ["dragon", "rabbit"].map(item_id => ({ kind: "icon", item_id }));
    await page.goto(`${origin}/loadout`);
    await page.getByRole("tab", { name: /아이콘/ }).click();
    await page.locator("#icons-panel button").filter({ hasText: "비취 드래곤" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "장착하기", exact: true }).click();
    await page.locator('[aria-label="현재 선택"]').locator("[data-profile-icon=dragon]").waitFor();
    assert.equal(await page.locator('[aria-label="현재 선택"]').locator("[data-profile-icon=dragon]").count(), 1);
    assert.equal(account.row.icon_id, "dragon");
    await page.reload();
    await page.getByRole("tab", { name: /아이콘/ }).click();
    await page.locator('[aria-label="현재 선택"]').locator("[data-profile-icon=dragon]").waitFor();
    for (const [width, height] of [[1440, 900], [375, 812], [320, 740]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      assert.equal(await page.locator("#icons-panel img").evaluateAll(async images => { await Promise.all(images.map(image => image.decode())); return images.every(image => image.complete && image.naturalWidth > 0); }), true);
      await page.screenshot({ path: path.join(artifacts, `icons-${width}x${height}.png`), fullPage: true });
    }
    await page.locator("#icons-tab").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#skins-tab").getAttribute("aria-selected"), "true");
    await page.keyboard.press("Home");
    assert.equal(await page.locator("#skins-tab").getAttribute("aria-selected"), "true");
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#icons-tab").getAttribute("aria-selected"), "true");
    const selection = page.locator("#icons-panel button").filter({ hasText: "구름 토끼" });
    await selection.focus();
    assert.notEqual(await selection.evaluate(el => getComputedStyle(el).outlineStyle), "none");
    assert.ok((await selection.boundingBox()).height >= 44);
    account.failSave = true;
    await selection.click();
    await page.getByRole("dialog").getByRole("button", { name: "장착하기", exact: true }).click();
    await page.getByRole("dialog").getByRole("alert").waitFor();
    assert.equal(await page.locator('[aria-label="현재 선택"]').locator("[data-profile-icon=dragon]").count(), 1);
    account.failSave = false;
    await page.getByRole("dialog").getByRole("button", { name: "장착하기", exact: true }).click();
    await page.locator('[aria-label="현재 선택"]').locator("[data-profile-icon=rabbit]").waitFor();
    assert.equal(await page.locator('[aria-label="현재 선택"]').locator("[data-profile-icon=rabbit]").count(), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("match reveal shows real payloads, handles reduced motion, skips, errors and reloads", async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const [width, height, reducedMotion] of [[1440, 900, "no-preference"], [375, 812, "reduce"]]) {
      const context = await browser.newContext({ locale: "ko-KR", viewport: { width, height }, reducedMotion });
      const page = await context.newPage(), errors = [];
    await mockCatalog(page);
      page.on("pageerror", error => errors.push(error.message));
      const sent = await mockMatch(page, { duplicate: true, opponentName: width === 375 ? "아주긴닉네임도화면밖으로나가지않아요" : "달빛수호자" });
      await page.clock.install();
      await page.goto(`${origin}/play/online`);
      const intro = page.getByRole("dialog", { name: "대전 상대 발견" });
      await intro.waitFor();
      const bounds = await intro.boundingBox();
      assert.deepEqual(bounds, { x: 0, y: 0, width, height }, JSON.stringify(await intro.evaluate(el => { const s = getComputedStyle(el); return { transform: s.transform, translate: s.translate, top: s.top, left: s.left, animation: s.animationName }; })));
      assert.equal(await intro.locator("[data-profile-icon=dragon]").count(), 1);
      assert.equal(await intro.locator("[data-profile-icon=owl]").count(), 1);
      assert.match(await intro.innerText(), /플래티넘/);
      assert.match(await intro.innerText(), /다이아몬드/);
      assert.equal(sent.filter(message => message.t === "joinRoom").length, 0);
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(artifacts, `match-${width}x${height}.png`), fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      const button = intro.getByRole("button", { name: "바로 입장", exact: true });
      assert.ok((await button.boundingBox()).height >= 44);
      await button.focus();
      assert.notEqual(await button.evaluate(el => getComputedStyle(el).outlineStyle), "none");
      if (reducedMotion === "reduce") {
        assert.equal(await intro.locator(".match-intro-you").evaluate(el => getComputedStyle(el).animationName), "none");
        await page.keyboard.press("Escape");
      } else await page.clock.fastForward(3400);
      await page.waitForURL(`**/play/${roomId}`);
      await page.locator(".match-screen").waitFor();
      assert.equal(await page.locator(".match-intro").count(), 0);
      await page.reload();
      await page.locator(".match-screen").waitFor();
      assert.equal(await page.locator(".match-intro").count(), 0);
      assert.deepEqual(errors, []);
      await context.close();
    }
    for (const scenario of ["friend", "error", "guest"]) {
      const context = await browser.newContext({ locale: "en-US", viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
    await mockCatalog(page);
      await mockMatch(page, { mode: scenario === "friend" ? "friend" : "casual", rating: null, iconId: "guest", fail: scenario === "error" });
      await page.goto(`${origin}/play/${scenario === "friend" ? "create" : "online"}`);
      if (scenario === "error") {
        await page.getByRole("main").getByRole("alert").waitFor();
        assert.equal(await page.locator(".match-intro").count(), 0);
      } else {
        const intro = page.getByRole("dialog", { name: "Match found" });
        await intro.waitFor();
        assert.equal(await intro.getByText("Unranked", { exact: true }).count(), 2);
        assert.ok((await intro.locator(".match-intro-icon").first().boundingBox()).height >= 90);
        assert.equal(await intro.getByRole("button", { name: "Enter now", exact: true }).count(), 0);
        await page.waitForURL(`**/play/${roomId}`);
      }
      await context.close();
    }
  } finally { await browser.close(); }
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { mockAccount } from "./browser-fixtures.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { createGameServer } = require("../../socket/src/server.ts");
const { rooms } = require("../../socket/src/state.ts");
const { broadcast, endGame } = require("../../socket/src/game.ts");
const origin = process.env.SOCIAL_TEST_ORIGIN || "http://[::1]:3001";
const artifacts = new URL("../../../docs/social/", import.meta.url).pathname;
const ids = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"];
const names = ["신청친구", "응답친구"];

test("online friends can decline, then accept a request and immediately play together on desktop and mobile", { timeout: 90000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const accountId = token => JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub;
  const server = createGameServer({
    resolveAccount: async token => ({ id: accountId(token), name: names[ids.indexOf(accountId(token))] }),
    readFriends: async token => ids.filter(id => id !== accountId(token)),
  });
  server.io.engine.opts.allowUpgrades = false;
  await new Promise(resolve => server.httpServer.listen(0, "127.0.0.1", resolve));
  await mkdir(artifacts, { recursive: true });
  const errors = [], pages = [];
  try {
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({ locale: "ko-KR", viewport: { width: i ? 375 : 1440, height: 900 } });
      await context.route("**/socket.io/**", async route => {
        const url = new URL(route.request().url());
        const response = await route.fetch({ url: `http://127.0.0.1:${server.httpServer.address().port}${url.pathname}${url.search}` });
        await route.fulfill({ response, headers: { ...response.headers(), "access-control-allow-origin": "*" } });
      });
      const page = await context.newPage(); pages.push(page);
      page.on("pageerror", error => errors.push(error.message));
      await mockAccount(page, ids[i]);
      await page.route("**/rest/v1/rpc/social_players", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
        { id: ids[1 - i], name: names[1 - i], icon_id: "owl", relationship: "friend", unread: 0 },
      ]) }));
      await page.goto(`${origin}${i ? "/find-match" : "/"}`);
    }
    const [a, b] = pages;
    const requestButton = a.getByRole("button", { name: "응답친구님에게 대전 신청" });
    await a.getByRole("region", { name: "내 친구", exact: true }).getByText("온라인", { exact: true }).waitFor();
    await a.screenshot({ path: `${artifacts}/challenge-button-desktop.png`, fullPage: true });
    await requestButton.click();
    await a.getByRole("dialog", { name: "대전을 신청했어요" }).waitFor();
    const incoming = b.getByRole("dialog", { name: "친구 대전 신청" });
    await incoming.getByText("신청친구님이 대전을 신청했어요.").waitFor();
    assert.equal(rooms.size, 0);
    assert.equal(await b.evaluate(() => document.documentElement.scrollWidth), 375);
    await b.waitForTimeout(250);
    await b.screenshot({ path: `${artifacts}/challenge-incoming-mobile.png`, fullPage: true });
    await incoming.getByRole("button", { name: "대전 거절" }).click();
    await a.getByText("대전 신청이 거절됐어요.").waitFor();
    await a.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(rooms.size, 0);

    await a.getByRole("link", { name: "친구 전체 보기" }).click();
    await requestButton.click();
    await a.getByText("잠시 기다린 뒤 다시 대전을 신청해 주세요.").waitFor();
    await a.waitForTimeout(5100);
    await requestButton.click();
    await incoming.getByRole("button", { name: "수락하고 시작" }).click();
    await Promise.all(pages.map(page => page.waitForURL(/\/play\/[a-f0-9-]{36}$/)));
    assert.equal(a.url(), b.url()); assert.equal(rooms.size, 1);
    const room = [...rooms.values()][0];
    assert.equal(room.mode, "friend");
    await Promise.all(pages.map(page => page.getByTestId("your-score").waitFor()));
    const started = Date.now();
    while (room.ready.size < 2 && Date.now() - started < 5000) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(room.ready.size, 2);
    const pid = room.players.find(pid => room.accounts[pid]?.id === ids[0]);
    room.state[pid].board = [{ id: 101, row: 0, col: 0, value: 2 }, { id: 102, row: 0, col: 1, value: 2 }];
    broadcast(room, server.io);
    await a.keyboard.press("a");
    await a.getByTestId("your-score").filter({ hasText: "4" }).waitFor();
    for (const [i, page] of pages.entries()) {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), page.viewportSize().width);
      await page.screenshot({ path: `${artifacts}/challenge-game-${i ? "mobile" : "desktop"}.png`, fullPage: true });
    }
    endGame(room, pid, "surrender", server.io);
    assert.deepEqual(errors, []);
  } finally {
    for (const context of browser.contexts()) await context.unrouteAll({ behavior: "ignoreErrors" });
    await browser.close();
    const closed = server.close(); server.httpServer.closeAllConnections(); await closed;
  }
});

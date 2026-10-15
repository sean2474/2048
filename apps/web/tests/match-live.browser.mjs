import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { createGameServer } = createRequire(import.meta.url)("../../socket/src/server.ts");
const { chromium } = createRequire(import.meta.url)("playwright");

// A real local socket server with no database services keeps QA matches out of production history.
test("two browser tabs see their friend-match intro before entering a real game", async () => {
  const server = createGameServer();
  server.io.engine.opts.allowUpgrades = false;
  await new Promise(resolve => server.httpServer.listen(0, "127.0.0.1", resolve));
  const socketOrigin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ locale: "ko-KR", viewport: { width: 375, height: 812 } });
  try {
    await context.route("**/socket.io/**", async route => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: `${socketOrigin}${url.pathname}${url.search}` });
      await route.fulfill({ response, headers: { ...response.headers(), "access-control-allow-origin": "*" } });
    });
    const a = await context.newPage(), b = await context.newPage(), errors = [];
    for (const page of [a, b]) page.on("pageerror", error => errors.push(error.message));
    await a.goto("http://[::1]:3001/play/create");
    await a.getByTestId("join-code").waitFor();
    const code = await a.getByTestId("join-code").innerText();
    await b.goto("http://[::1]:3001/play/join");
    await b.locator("#room-code").fill(code);
    await b.locator("form button[type=submit]").click();
    await Promise.all([a, b].map(page => page.getByRole("dialog", { name: "대전 상대 발견" }).waitFor()));
    assert.equal(await a.locator(".match-intro [data-profile-icon=guest]").count(), 2);
    assert.equal(await b.locator(".match-intro [data-profile-icon=guest]").count(), 2);
    const dir = fileURLToPath(new URL("../../../docs/profile-icons/", import.meta.url));
    fs.mkdirSync(dir, { recursive: true });
    await b.waitForTimeout(800);
    await b.screenshot({ path: `${dir}/live-guest-match.png` });
    await Promise.all([a, b].map(async page => {
      await page.waitForURL(/\/play\/[a-f\d-]{36}$/);
      await page.locator(".match-screen").waitFor();
      await page.getByRole("button", { name: "오른쪽으로 이동", exact: true }).waitFor();
    }));
    assert.equal(a.url(), b.url());
    assert.equal(await a.getByRole("button", { name: "오른쪽으로 이동", exact: true }).isEnabled(), true);
    assert.equal(await b.getByRole("button", { name: "오른쪽으로 이동", exact: true }).isEnabled(), true);
    assert.deepEqual(errors, []);
  } finally { await context.unrouteAll({ behavior: "ignoreErrors" }); await browser.close(); await server.close(); }
});

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mockAccount } from "./browser-fixtures.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const root = fileURLToPath(new URL("../../../", import.meta.url));
const origin = "http://[::1]:3001";
const artifacts = path.join(root, "docs/skin-expansion");

test("two real game clients keep each player's skin through moves, reload and result", async () => {
  const server = spawn("pnpm", ["--filter", "socket", "exec", "tsx", "../web/tests/skin-match.fixture.ts"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let browser;
  try {
    const port = await new Promise((resolve, reject) => {
      let output = "";
      const timeout = setTimeout(() => reject(Error("Fixture server did not start")), 10000);
      server.stdout.on("data", data => {
        output += data;
        const match = output.match(/\{"port":(\d+)\}/);
        if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
      });
      server.once("error", error => { clearTimeout(timeout); reject(error); });
    });
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const a = await browser.newPage({ locale: "en-US", viewport: { width: 1440, height: 900 } });
    const b = await browser.newPage({ locale: "en-US", viewport: { width: 375, height: 812 } });
    const errors = [];
    for (const [page, id, skin] of [[a, "97", "arcanist"], [b, "98", "classic"]]) {
      page.setDefaultTimeout(12000);
      page.on("pageerror", error => errors.push(error.message));
      const account = await mockAccount(page, `10000000-0000-4000-8000-0000000000${id}`);
      account.row.skin_id = skin; account.row.locale = "en";
      // Only the disposable browser transports point at the isolated game server.
      await page.route("**/socket.io/**", route => {
        const url = new URL(route.request().url());
        url.hostname = "127.0.0.1"; url.port = String(port);
        return route.continue({ url: url.href });
      });
      await page.addInitScript(port => {
        const NativeWebSocket = window.WebSocket;
        window.WebSocket = class extends NativeWebSocket {
          constructor(url, protocols) {
            const target = new URL(url);
            if (target.pathname.startsWith("/socket.io/")) { target.hostname = "127.0.0.1"; target.port = String(port); }
            super(target.href, protocols);
          }
        };
      }, port);
    }
    await a.goto(`${origin}/play/create`);
    const code = await a.getByTestId("join-code").innerText();
    await b.goto(`${origin}/play/join`);
    await b.getByLabel("Room code", { exact: true }).fill(code);
    await b.getByRole("button", { name: "Join room", exact: true }).click();
    for (const page of [a, b]) await page.waitForURL(/\/play\/[0-9a-f-]{36}$/);
    for (const [page, own, opponent] of [[a, "arcanist", "classic"], [b, "classic", "arcanist"]]) {
      await page.locator(`.game-you [data-skin="${own}"]`).waitFor();
      await page.locator(`.game-opponent [data-skin="${opponent}"]`).waitFor();
      assert.ok(await page.locator(`[data-skin="arcanist"] [role=img] svg`).count() > 0);
      assert.equal(await page.locator(`[data-skin="classic"] [role=img] svg`).count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), page.viewportSize().width);
    }
    await a.keyboard.press("ArrowLeft");
    await a.reload();
    await a.locator('.game-you [data-skin="arcanist"]').waitFor();
    await b.getByRole("button", { name: "Surrender", exact: true }).waitFor({ state: "visible" });
    fs.mkdirSync(artifacts, { recursive: true });
    for (const [page, name] of [[a, "magic"], [b, "classic"]]) await page.screenshot({ path: path.join(artifacts, `match-${name}.png`), fullPage: true, animations: "disabled" });
    await b.getByRole("button", { name: "Surrender", exact: true }).click();
    await b.getByRole("alertdialog").getByRole("button", { name: "Surrender", exact: true }).click();
    await a.getByRole("heading", { name: "You win!", exact: true }).waitFor();
    assert.equal(await a.locator('.game-you [data-skin="arcanist"]').count(), 1);
    assert.equal(await b.locator('.game-opponent [data-skin="arcanist"]').count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    const stopped = once(server, "exit");
    try { process.kill(-server.pid, "SIGTERM"); } catch { /* Already stopped. */ }
    if (server.exitCode === null) await stopped;
  }
});

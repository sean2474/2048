import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { startServerFixture } from "./server-fixture.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { require: requireTs } = createRequire(new URL("../../socket/package.json", import.meta.url))(
  "tsx/cjs/api",
);
const { createGameServer } = requireTs("../../socket/src/server.ts", import.meta.url);
const artifacts = fileURLToPath(new URL("../../../docs/rematch/", import.meta.url));

test(
  "two players can rematch repeatedly, decline, cancel, leave and use the final-board controls",
  { timeout: 180000 },
  async () => {
    const fixture = await startServerFixture();
    const server = createGameServer();
    server.io.engine.opts.allowUpgrades = false;
    await new Promise((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
    const socketOrigin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      locale: "ko-KR",
      viewport: { width: 375, height: 812 },
    });
    const errors = [];
    context.on("page", (page) => {
      page.setDefaultTimeout(15000);
      page.on("pageerror", (error) => errors.push(error.message));
    });
    try {
      await mkdir(artifacts, { recursive: true });
      await context.route("**/socket.io/**", async (route) => {
        const url = new URL(route.request().url());
        const response = await route.fetch({
          url: `${socketOrigin}${url.pathname}${url.search}`,
          headers: { ...route.request().headers(), origin: "http://127.0.0.1:3001" },
        });
        await route.fulfill({
          response,
          headers: { ...response.headers(), "access-control-allow-origin": "*" },
        });
      });
      const a = await context.newPage(),
        b = await context.newPage();
      const dialog = (page) => page.getByRole("dialog");
      const playing = async (oldUrl) => {
        for (const page of [a, b]) {
          await page.waitForURL(
            (url) => /\/play\/[a-f\d-]{36}$/.test(url.pathname) && url.href !== oldUrl,
          );
          await page.getByRole("button", { name: "기권", exact: true }).waitFor();
          await page.getByRole("heading", { name: "대전 중", exact: true }).waitFor();
        }
        assert.equal(a.url(), b.url());
      };
      const pair = async () => {
        await a.goto(fixture.origin + "/play/online");
        await a.locator('.lobby-queue[data-searching="true"]').waitFor();
        await b.goto(fixture.origin + "/play/online");
        await playing();
      };
      const finish = async () => {
        await a.getByRole("button", { name: "기권", exact: true }).click();
        await a.getByRole("alertdialog").getByRole("button", { name: "기권", exact: true }).click();
        for (const page of [a, b])
          await dialog(page).getByRole("button", { name: "재대결", exact: true }).waitFor();
      };
      await pair();
      for (let round = 0; round < 2; round++) {
        const previous = a.url();
        await finish();
        await dialog(a).getByRole("button", { name: "재대결", exact: true }).click();
        await dialog(a).getByRole("button", { name: "재대결 취소", exact: true }).waitFor();
        const accept = dialog(b).getByRole("button", { name: "재대결 수락", exact: true });
        await accept.waitFor();
        if (round === 0) {
          for (const [width, height] of [
            [375, 812],
            [768, 1024],
            [1440, 900],
          ]) {
            await b.setViewportSize({ width, height });
            assert.equal(await b.evaluate(() => document.documentElement.scrollWidth), width);
            assert.ok((await accept.boundingBox()).height >= 44);
            await b.screenshot({
              path: `${artifacts}/request-${width}.png`,
              animations: "disabled",
              fullPage: true,
            });
          }
          await b.setViewportSize({ width: 375, height: 812 });
          await accept.focus();
          assert.equal(await accept.evaluate((el) => el === document.activeElement), true);
          await b.keyboard.press("Enter");
        } else {
          await dialog(b).getByRole("button", { name: "마지막 보드 보기", exact: true }).click();
          await b.getByRole("button", { name: "재대결 수락", exact: true }).click();
        }
        await playing(previous);
        assert.equal(await a.locator("[data-rematch-status]").count(), 0);
        await a.locator('.direction-pad [data-direction="left"]').click();
      }
      await finish();
      await dialog(a).getByRole("button", { name: "재대결", exact: true }).click();
      await dialog(b).getByRole("button", { name: "거절", exact: true }).click();
      for (const page of [a, b])
        await dialog(page).getByText("재대결 요청이 거절되었어요.").waitFor();
      await pair();
      await finish();
      await dialog(a).getByRole("button", { name: "재대결", exact: true }).click();
      await dialog(a).getByRole("button", { name: "재대결 취소", exact: true }).click();
      for (const page of [a, b])
        await dialog(page).getByText("재대결 요청이 취소되었어요.").waitFor();
      await pair();
      await finish();
      await dialog(a).getByRole("button", { name: "재대결", exact: true }).click();
      await dialog(b).getByRole("link", { name: "대전 메뉴로", exact: true }).click();
      await dialog(a).getByText("플레이어가 떠났어요. 다른 상대와 대전할 수 있어요.").waitFor();
      await dialog(a).getByRole("link", { name: "다른 상대 찾기", exact: true }).click();
      await a.waitForURL("**/play/online");
      assert.deepEqual(errors, []);
    } finally {
      await context.unrouteAll({ behavior: "ignoreErrors" });
      await browser.close();
      await server.close();
      await fixture.close();
    }
  },
);

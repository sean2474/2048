import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { startServerFixture } from "./server-fixture.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { require: requireTs } = createRequire(new URL("../../socket/package.json", import.meta.url))(
  "tsx/cjs/api",
);
const { createGameServer } = requireTs("../../socket/src/server.ts", import.meta.url);

test(
  "server game composition preserves mobile solo controls and live two-player matches",
  { timeout: 120000 },
  async () => {
    const fixture = await startServerFixture();
    const server = createGameServer();
    server.io.engine.opts.allowUpgrades = false;
    await new Promise((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
    const socketOrigin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      locale: "en-US",
      viewport: { width: 375, height: 812 },
    });
    const errors = [];
    context.on("page", (page) => {
      page.setDefaultTimeout(15000);
      page.on("pageerror", (error) => errors.push(error.message));
    });
    try {
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
      const solo = await context.newPage();
      await solo.goto(fixture.origin + "/solo");
      await solo.getByRole("button", { name: "Start time attack", exact: true }).click();
      await solo.getByRole("button", { name: "Restart run", exact: true }).waitFor();
      await solo.waitForFunction(
        () => document.activeElement?.getAttribute("aria-label") === "Solo controls",
      );
      // Model distinct key presses, allowing authoritative acknowledgements between
      // them. A zero-delay burst can be discarded while the first move is pending.
      for (const key of ["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"]) {
        await solo.keyboard.press(key, { delay: 80 });
        await solo.waitForFunction(() =>
          [...document.querySelectorAll("button")].some(
            (button) => button.textContent.includes("Restart run") && !button.disabled,
          ),
        );
      }
      await solo.waitForFunction(
        () =>
          Number(document.querySelector(".solo-page dl > div:nth-child(3) dd")?.textContent) > 0,
      );
      await solo.getByRole("button", { name: /Endless mode/ }).click();
      await solo
        .getByRole("alertdialog")
        .getByRole("button", { name: "Start endless mode", exact: true })
        .click();
      await solo
        .getByRole("button", { name: /Endless mode/ })
        .getAttribute("aria-pressed")
        .then((value) => assert.equal(value, "true"));
      await solo.getByRole("button", { name: "Records, rules & rewards", exact: true }).click();
      const details = solo.getByRole("dialog");
      await details.getByText("Best milestone", { exact: true }).waitFor();
      await details.getByText(/No time limit, abilities or undo/).waitFor();
      await solo.keyboard.press("Escape");
      assert.equal(await solo.evaluate(() => document.documentElement.scrollWidth), 375);
      await solo.close();

      const a = await context.newPage(),
        b = await context.newPage();
      await a.goto(fixture.origin + "/play/online");
      await a.locator('.lobby-queue[data-searching="true"]').waitFor();
      await b.goto(fixture.origin + "/play/online");
      await Promise.all(
        [a, b].map(async (page) => {
          await page.waitForURL(/\/play\/[a-f\d-]{36}$/);
          await page.locator(".match-screen").waitFor();
          await page.locator("[data-ability-control]").waitFor();
        }),
      );
      assert.equal(a.url(), b.url());
      assert.equal(await a.locator(".direction-pad").isVisible(), true);
      assert.equal(await a.evaluate(() => document.documentElement.scrollWidth), 375);
      const tileLabels = () =>
        a.locator('.game-you [role="img"][aria-label*="tile"]').evaluateAll((tiles) =>
          tiles
            .map((tile) => tile.getAttribute("aria-label"))
            .sort()
            .join(";"),
        );
      const boardBefore = await tileLabels();
      for (const direction of ["left", "down", "right", "up"])
        await a.locator(`.direction-pad [data-direction="${direction}"]`).click();
      assert.notEqual(await tileLabels(), boardBefore, "direction buttons update the live board");
      await a.getByRole("button", { name: "Surrender", exact: true }).click();
      await a
        .getByRole("alertdialog")
        .getByRole("button", { name: "Surrender", exact: true })
        .click();
      await a.getByText("You lose.", { exact: true }).first().waitFor();
      await b.getByText("You win!", { exact: true }).first().waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await context.unrouteAll({ behavior: "ignoreErrors" });
      await browser.close();
      await server.close();
      await fixture.close();
    }
  },
);

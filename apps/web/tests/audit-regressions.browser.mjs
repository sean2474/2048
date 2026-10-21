import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { createGameServer } = require("../../socket/src/server.ts");
const origin = "http://[::1]:3001";

test(
  "a failed preference save and its retry preserve the active game connection",
  { timeout: 60000 },
  async () => {
    const server = createGameServer();
    server.io.engine.opts.allowUpgrades = false;
    await new Promise((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
    const socketOrigin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const connections = [];
    let moves = 0;
    server.io.on("connection", (socket) => {
      connections.push(socket.id);
      socket.removeAllListeners("message");
      socket.on("message", (message) => {
        if (message.t !== "joinRoom" && message.t !== "input") return;
        if (message.t === "input") moves++;
        const player = {
          board: [{ id: 1, row: 0, col: 0, value: 2 }],
          score: moves * 4,
          maxTile: 2,
          skinId: "classic",
          attacksSent: { xblock: 0, hardblock: 0 },
          ability: {
            id: "clear-x",
            charge: 0,
            spawnPauseMoves: 0,
            anchorMoves: 0,
            slowStartsAt: 0,
            slowEndsAt: 0,
            nextMoveAt: 0,
          },
        };
        socket.emit("message", {
          t: "state",
          serverTime: Date.now(),
          mode: "casual",
          you: player,
          opp: player,
          names: { you: "Guest", opp: "Opponent" },
          paused: false,
          pendingAttacks: 0,
          incomingAttacks: { xblock: 0, hardblock: 0 },
        });
      });
    });
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({ locale: "en-US" });
    try {
      await context.route("**/socket.io/**", async (route) => {
        const url = new URL(route.request().url());
        const response = await route.fetch({ url: `${socketOrigin}${url.pathname}${url.search}` });
        await route.fulfill({
          response,
          headers: { ...response.headers(), "access-control-allow-origin": "*" },
        });
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${origin}/play/20000000-0000-4000-8000-000000000001`);
      await page.getByTestId("your-score").waitFor();
      assert.equal(connections.length, 1);
      await page.evaluate(() => {
        const cookie = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
        Object.defineProperty(document, "cookie", {
          configurable: true,
          get() {
            return cookie.get.call(this);
          },
          set(value) {
            if (value.startsWith("duo.guest-settings="))
              throw new Error("Fixture blocked preferences");
            cookie.set.call(this, value);
          },
        });
      });
      const shortcuts = page.getByRole("checkbox", { name: "Enable custom shortcuts" });
      await page.getByRole("button", { name: "Keybindings", exact: true }).click();
      await shortcuts.uncheck();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Save keys", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByText("Could not save your settings. Please try again.", { exact: true })
        .waitFor();
      await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(
        () => document.querySelector('[data-testid="your-score"]')?.textContent === "4",
      );
      assert.equal(
        connections.length,
        1,
        "saving an unrelated preference must not reconnect the game",
      );
      await page.evaluate(() => {
        delete document.cookie;
      });
      await page.getByRole("button", { name: "Keybindings", exact: true }).click();
      await shortcuts.uncheck();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Save keys", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page
        .getByText("Could not save your settings. Please try again.", { exact: true })
        .waitFor({ state: "hidden" });
      await page.keyboard.press("ArrowLeft");
      await page.waitForFunction(
        () => document.querySelector('[data-testid="your-score"]')?.textContent === "8",
      );
      assert.equal(
        connections.length,
        1,
        "retrying a preference save must preserve the connection",
      );
      await page.getByRole("button", { name: "Keybindings", exact: true }).click();
      assert.equal(await shortcuts.isChecked(), false);
      await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
      assert.deepEqual(errors, []);
    } finally {
      await context.unrouteAll({ behavior: "ignoreErrors" });
      await browser.close();
      await server.close();
    }
  },
);

test(
  "solo board hydrates with saved, malformed and unavailable score storage",
  { timeout: 60000 },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      for (const [saved, expected] of [
        ["2048", "2048"],
        ["NaN", "0"],
        ["-1", "0"],
        [null, "0"],
      ]) {
        const context = await browser.newContext({ locale: "en-US" });
        await context.addInitScript((saved) => {
          if (saved !== null) localStorage.setItem("best2048", saved);
          else {
            for (const method of ["getItem", "setItem"]) {
              const original = Storage.prototype[method];
              Storage.prototype[method] = function (key, ...args) {
                if (key === "best2048") throw new Error("Fixture blocked score storage");
                return original.call(this, key, ...args);
              };
            }
          }
          Math.random = () => 0.1;
        }, saved);
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error" && /hydrat/i.test(message.text()))
            errors.push(message.text());
        });
        await page.goto(`${origin}/test`);
        const board = page.getByRole("group", { name: "Game board", exact: true });
        await board.locator('[role="img"]').first().waitFor();
        await page.waitForFunction(
          (expected) =>
            document.querySelector("main header .text-right:last-child .text-lg")?.textContent ===
            expected,
          expected,
        );
        if (saved === null) {
          await page.keyboard.press("ArrowLeft");
          await page.waitForFunction(
            () =>
              document.querySelector("main header .text-right:first-child .text-lg")
                ?.textContent === "4",
          );
          assert.equal(
            await page.locator("main header .text-right:last-child .text-lg").textContent(),
            "4",
          );
          await page
            .getByText("Best score cannot be saved in this browser.", { exact: true })
            .waitFor();
        }
        assert.deepEqual(errors, [], `score storage: ${saved}`);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  },
);

test(
  "solo input respects browser shortcuts, menu focus and page scrolling",
  { timeout: 60000 },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const context = await browser.newContext({
        locale: "en-US",
        viewport: { width: 375, height: 812 },
        hasTouch: true,
        isMobile: true,
      });
      await context.addInitScript(() => {
        Math.random = () => 0.1;
      });
      const page = await context.newPage();
      await page.goto(`${origin}/test`);
      const board = page.getByRole("group", { name: "Game board", exact: true });
      await board.locator('[role="img"]').first().waitFor();
      const labels = () =>
        board
          .locator('[role="img"]')
          .evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute("aria-label")));
      const before = await labels();
      const prevented = await page.evaluate(() => {
        const results = [];
        for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
          const event = new KeyboardEvent("keydown", {
            key: "a",
            bubbles: true,
            cancelable: true,
            ...modifiers,
          });
          document.body.dispatchEvent(event);
          results.push(event.defaultPrevented);
        }
        for (const tag of ["input", "div"]) {
          const target = document.createElement(tag);
          if (tag === "div") target.setAttribute("role", "menu");
          document.body.append(target);
          target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
          target.remove();
        }
        const handled = new KeyboardEvent("keydown", {
          key: "ArrowLeft",
          bubbles: true,
          cancelable: true,
        });
        handled.preventDefault();
        document.body.dispatchEvent(handled);
        return results;
      });
      assert.deepEqual(
        prevented,
        [false, false, false],
        "browser shortcuts must retain their default behavior",
      );
      assert.deepEqual(
        await labels(),
        before,
        "handled keys and focused controls must not move tiles",
      );
      for (const target of [page.locator("main header"), board]) {
        await target.evaluate((element) => {
          const start = new Touch({ identifier: 1, target: element, clientX: 200, clientY: 100 });
          const end = new Touch({ identifier: 1, target: element, clientX: 100, clientY: 100 });
          element.dispatchEvent(
            new TouchEvent("touchstart", {
              bubbles: true,
              touches: [start],
              changedTouches: [start],
            }),
          );
          element.dispatchEvent(
            new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [end] }),
          );
        });
        if (target !== board)
          assert.deepEqual(
            await labels(),
            before,
            "scrolling outside the board must not move tiles",
          );
      }
      await page.waitForFunction(
        () =>
          document.querySelector("main header .text-right:first-child .text-lg")?.textContent ===
          "4",
      );
      assert.notDeepEqual(await labels(), before);
      assert.equal(
        await board.evaluate((element) => getComputedStyle(element).touchAction),
        "none",
      );
      await context.close();
    } finally {
      await browser.close();
    }
  },
);
